import { remoteStorageConfig } from "./remote-storage-config.server";
import { createClient, type Client, type Transaction, type InValue } from "@libsql/client/http";
import { RemoteRepositoryCore } from "./remote-space-core.server";
import type { SpaceRepository } from "./space-repository.server";
import { AUTH_SCHEMA, AuthCore } from "./auth-core.server";

type SqlExecutor = Pick<Client, "execute"> | Pick<Transaction, "execute">;
/** Request-local SQL connection. Never share an open transaction between requests. */
export class RemoteSql {
  constructor(private executor: SqlExecutor) {}
  prepare(sql: string) {
    return {
      get: async (...args: InValue[]) => (await this.executor.execute({ sql, args })).rows[0],
      all: async (...args: InValue[]) => (await this.executor.execute({ sql, args })).rows,
      run: async (...args: InValue[]) => {
        await this.executor.execute({ sql, args });
      },
    };
  }
}

const schema = [
  "CREATE TABLE IF NOT EXISTS spaces (id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL, creator_role TEXT NOT NULL, invite TEXT UNIQUE, invite_expires INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS members (session_hash TEXT NOT NULL, space_id TEXT NOT NULL REFERENCES spaces(id), role TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(session_hash, space_id), UNIQUE(space_id, role))",
  "CREATE TABLE IF NOT EXISTS telegram_proofs (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), routine_id TEXT NOT NULL, day TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, expires INTEGER NOT NULL, dom_yes INTEGER NOT NULL DEFAULT 0, sub_yes INTEGER NOT NULL DEFAULT 0, media INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS telegram_links (token_hash TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES telegram_proofs(id), role TEXT NOT NULL, UNIQUE(ticket_id,role))",
  "CREATE TABLE IF NOT EXISTS telegram_members (space_id TEXT NOT NULL REFERENCES spaces(id), role TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(space_id,role), UNIQUE(space_id,user_id))",
  "CREATE TABLE IF NOT EXISTS telegram_updates (id INTEGER PRIMARY KEY, at INTEGER NOT NULL)",
  ...AUTH_SCHEMA,
];

export type SpaceStorage = {
  [K in "create" | "join" | "preview" | "read" | "change" | "openTelegram" | "telegramUpdate"]: (
    ...args: Parameters<SpaceRepository[K]>
  ) => ReturnType<SpaceRepository[K]> | Promise<ReturnType<SpaceRepository[K]>>;
} & {
  auth<T>(fn: (core: AuthCore) => Promise<T>): Promise<T>;
};

/** Durable primary libSQL database, using atomic write transactions across instances.
 * No replicas, local files, or /tmp fallbacks. Every response follows commit. */
export class RemoteSpaceRepository implements SpaceStorage {
  private ready: Promise<void> | undefined;
  constructor(
    private client: Client,
    private now: () => Date = () => new Date(),
  ) {}
  private initialize() {
    if (!this.ready) {
      this.ready = this.client
        .batch(schema, "write")
        .then(() => undefined)
        .catch((error) => {
          this.ready = undefined;
          throw error;
        });
    }
    return this.ready;
  }
  private async invoke<K extends Exclude<keyof SpaceStorage, "auth">>(
    method: K,
    args: Parameters<SpaceRepository[K]>,
  ): Promise<ReturnType<SpaceRepository[K]>> {
    await this.initialize();
    const tx = await this.client.transaction("write");
    try {
      const repository = new RemoteRepositoryCore(new RemoteSql(tx), this.now);
      // Each method's parameter/return mapping is declared by the public facade.
      const call = repository[method].bind(repository) as (
        ...input: Parameters<SpaceRepository[K]>
      ) => Promise<ReturnType<SpaceRepository[K]>>;
      const result = await call(...args);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback().catch(() => {});
      throw error;
    } finally {
      tx.close();
    }
  }
  /** Runs account work in one write transaction against the primary database. */
  async auth<T>(fn: (core: AuthCore) => Promise<T>): Promise<T> {
    await this.initialize();
    const tx = await this.client.transaction("write");
    try {
      const result = await fn(new AuthCore(new RemoteSql(tx), this.now));
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback().catch(() => {});
      throw error;
    } finally {
      tx.close();
    }
  }
  create(...args: Parameters<SpaceRepository["create"]>) {
    return this.invoke("create", args);
  }
  join(...args: Parameters<SpaceRepository["join"]>) {
    return this.invoke("join", args);
  }
  preview(...args: Parameters<SpaceRepository["preview"]>) {
    return this.invoke("preview", args);
  }
  read(...args: Parameters<SpaceRepository["read"]>) {
    return this.invoke("read", args);
  }
  change(...args: Parameters<SpaceRepository["change"]>) {
    return this.invoke("change", args);
  }
  openTelegram(...args: Parameters<SpaceRepository["openTelegram"]>) {
    return this.invoke("openTelegram", args);
  }
  telegramUpdate(...args: Parameters<SpaceRepository["telegramUpdate"]>) {
    return this.invoke("telegramUpdate", args);
  }
  close() {
    this.client.close();
  }
}

export function connectRemoteStorage() {
  const config = remoteStorageConfig();
  if (!config) throw new Error("REMOTE_DATABASE_NOT_CONFIGURED");
  return new RemoteSpaceRepository(createClient(config));
}
