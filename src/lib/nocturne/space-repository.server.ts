import { DatabaseSync } from "node:sqlite";
import {
  ACCOUNT_MEMBERSHIP_EXPIRES,
  AUTH_SCHEMA,
  AuthCore,
  asyncSql,
  isPrincipal,
} from "./auth-core.server";
import { summarizeSpace } from "./dashboard";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { pointsAwardSchema, pointsLevelsSchema } from "./points";
import { createInitialState } from "./initial-state";
import { savedStateSchema } from "./storage";
import { transition, type Command } from "./engine";
import { createAgreement, upgradeAgreement } from "./agreement-document";
import { dateKey } from "./logic";
import type { AppState, Role } from "./types";
import type { SpaceSnapshot } from "./space-protocol";
import { TelegramProofStore, telegramConfigured } from "./telegram-proof.server";

const id = z.string().min(1).max(100);
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("points.award"), entry: pointsAwardSchema }).strict(),
  z
    .object({
      type: z.literal("points.adjust"),
      id,
      action: z.enum(["resolve", "void"]),
      note: z.string().trim().min(1).max(500),
    })
    .strict(),
  z.object({ type: z.literal("points.levels"), levels: pointsLevelsSchema }).strict(),
  z
    .object({ type: z.literal("routine.save"), routine: savedStateSchema.shape.routines.element })
    .strict(),
  z.object({ type: z.literal("routine.delete"), id }).strict(),
  z
    .object({
      type: z.literal("goal.save"),
      goal: savedStateSchema.shape.goals.removeDefault().element,
    })
    .strict(),
  z
    .object({
      type: z.literal("task.prepare"),
      id,
      preparation: z.enum(["optIn", "acknowledge", "decline"]),
    })
    .strict(),
  z.object({ type: z.literal("task.excuse"), id }).strict(),
  z.object({ type: z.literal("challenge"), id }).strict(),
  z
    .object({
      type: z.literal("submission"),
      id,
      text: z.string().max(1000),
      challengeId: id.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("review"),
      id,
      decision: z.enum(["accepted", "revision", "rejected"]),
      response: z.string().max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("request"),
      request: savedStateSchema.shape.requests.element.omit({
        id: true,
        at: true,
        by: true,
        status: true,
        response: true,
      }),
    })
    .strict(),
  z
    .object({
      type: z.literal("request.resolve"),
      id,
      accept: z.boolean(),
      response: z.string().max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("pause"),
      reason: z.string().max(300),
      signal: z.enum(["RED", "YELLOW"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("message"),
      text: z.string().min(1).max(1000),
      channel: z.enum(["notes", "discussion"]),
      routineId: id.optional(),
    })
    .strict(),
  z.object({ type: z.literal("resume") }).strict(),
  z.object({ type: z.literal("agreement.ack") }).strict(),
  z
    .object({
      type: z.literal("agreement.propose"),
      section: z.string().max(100),
      text: z.string().max(300),
    })
    .strict(),
  z.object({ type: z.literal("agreement.resolve"), id, accept: z.boolean() }).strict(),
  z.object({ type: z.literal("prefs"), patch: savedStateSchema.shape.prefs.partial() }).strict(),
]);
export const bodySchema = savedStateSchema.extend({
  challenge: z
    .object({
      id: z.string(),
      routineId: z.string(),
      date: z.string(),
      prompt: z.string(),
      expiresAt: z.number(),
    })
    .optional(),
});
type Row = {
  id: string;
  body: string;
  revision: number;
  creator_role: Role;
  invite: string | null;
  invite_expires: number;
};
type Member = { space_id: string; role: Role };
const secret = () => randomBytes(32).toString("hex");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const WEEK = 7 * 24 * 60 * 60 * 1000;
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

export class SpaceError extends Error {
  constructor(
    public status: number,
    message: string,
    public snapshot?: SpaceSnapshot,
  ) {
    super(message);
  }
}

/** One persistent Node host; BEGIN IMMEDIATE serializes join and every state change. */
export class SpaceRepository {
  private db: DatabaseSync;
  private telegram: TelegramProofStore;
  constructor(
    path: string,
    private now: () => Date = () => new Date(),
  ) {
    if (path !== ":memory:") {
      path = resolve(path);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    }
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS spaces (id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL, creator_role TEXT NOT NULL, invite TEXT UNIQUE, invite_expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS members (session_hash TEXT NOT NULL, space_id TEXT NOT NULL REFERENCES spaces(id), role TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(session_hash, space_id), UNIQUE(space_id, role));`);
    const columns = this.db.prepare("PRAGMA table_info(members)").all() as {
      name: string;
      pk: number;
    }[];
    if (!columns.some((c) => c.name === "space_id" && c.pk > 0)) {
      // VACUUM includes WAL contents. Never copy a live SQLite main file alone.
      if (path !== ":memory:") {
        const backup = `${path}.before-multiple-spaces-${randomUUID()}.sqlite`;
        this.db.prepare("VACUUM INTO ?").run(backup);
        chmodSync(backup, 0o600);
      }
      this.transaction(() => {
        this.db.exec(`ALTER TABLE members RENAME TO members_legacy;
          CREATE TABLE members (session_hash TEXT NOT NULL, space_id TEXT NOT NULL REFERENCES spaces(id), role TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(session_hash, space_id), UNIQUE(space_id, role));
          INSERT INTO members SELECT session_hash, space_id, role, expires FROM members_legacy;
          DROP TABLE members_legacy;`);
      });
    }
    this.telegram = new TelegramProofStore(this.db);
    for (const statement of AUTH_SCHEMA) this.db.exec(statement);
  }
  private authQueue: Promise<unknown> = Promise.resolve();
  /** Runs account work in one write transaction, one call at a time on this connection. */
  auth<T>(fn: (core: AuthCore) => Promise<T>): Promise<T> {
    const run = async () => {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn(new AuthCore(asyncSql(this.db), this.now));
        this.db.exec("COMMIT");
        return result;
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    };
    const next = this.authQueue.then(run, run);
    this.authQueue = next.catch(() => {});
    return next;
  }
  close() {
    this.db.close();
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private memberships(session: string): Member[] {
    return this.db
      .prepare(
        "SELECT space_id, role FROM members WHERE session_hash=? AND expires>? ORDER BY rowid",
      )
      .all(hash(session), this.now().valueOf()) as Member[];
  }
  private member(session: string, spaceId?: string, writing = false): Member {
    const memberships = this.memberships(session);
    if (writing && !spaceId && memberships.length > 1)
      throw new SpaceError(400, "Select the space before making changes. Refresh this page.");
    const found = spaceId ? memberships.find((m) => m.space_id === spaceId) : memberships[0];
    if (!found && memberships.length && spaceId)
      throw new SpaceError(403, "This space is not part of your memberships.");
    if (!found)
      throw new SpaceError(
        401,
        "No active space on this browser. Open an invitation or create a space.",
      );
    return found;
  }
  private row(spaceId: string): Row {
    const row = this.db.prepare("SELECT * FROM spaces WHERE id=?").get(spaceId) as Row | undefined;
    if (!row) throw new SpaceError(404, "This space is unavailable.");
    return row;
  }
  private state(row: Row): AppState {
    return bodySchema.parse(JSON.parse(row.body)) as AppState;
  }
  private snapshot(row: Row, role: Role, session: string): SpaceSnapshot {
    const current = this.state(row);
    return {
      telegram: {
        configured: telegramConfigured(),
        proofs: this.telegram.list(row.id, this.now()),
      },
      spaces: this.memberships(session).map((member) => {
        const state = this.state(this.row(member.space_id));
        return {
          id: member.space_id,
          role: member.role,
          partnerName: state.names[member.role === "dom" ? "sub" : "dom"],
          paired: state.space.paired,
          paused: state.pause.active,
        };
      }),
      state: {
        ...current,
        myRole: role,
        viewRole: role,
        ...(role !== "sub" ? { challenge: undefined } : {}),
      },
      revision: row.revision,
      createdByMe: role === row.creator_role,
      invite:
        role === row.creator_role && row.invite && row.invite_expires > this.now().valueOf()
          ? { token: row.invite, expiresAt: row.invite_expires }
          : null,
    };
  }
  private save(row: Row, state: AppState) {
    // Validate the resulting domain record before committing it.
    const validated = bodySchema.parse(state);
    this.db
      .prepare("UPDATE spaces SET body=?, revision=revision+1 WHERE id=?")
      .run(JSON.stringify(validated), row.id);
  }
  private addMember(spaceId: string, role: Role, session: string) {
    if (isPrincipal(session)) {
      // Account memberships are keyed to the server-side account identity.
      this.db
        .prepare("INSERT INTO members (session_hash, space_id, role, expires) VALUES (?, ?, ?, ?)")
        .run(hash(session), spaceId, role, ACCOUNT_MEMBERSHIP_EXPIRES);
      this.db
        .prepare("INSERT INTO member_accounts (space_id, role, user_id) VALUES (?, ?, ?)")
        .run(spaceId, role, session.slice(5));
      return session;
    }
    const token = this.memberships(session).length ? session : secret();
    // Keep one anonymous identity across its private relationships.
    this.db
      .prepare("UPDATE members SET expires=? WHERE session_hash=?")
      .run(this.now().valueOf() + SESSION_SECONDS * 1000, hash(token));
    this.db
      .prepare("INSERT INTO members (session_hash, space_id, role, expires) VALUES (?, ?, ?, ?)")
      .run(hash(token), spaceId, role, this.now().valueOf() + SESSION_SECONDS * 1000);
    return token;
  }
  create(name: string, role: Role, session = "", timeZone = "UTC") {
    return this.transaction(() => {
      const initial = createInitialState(),
        spaceId = randomUUID(),
        invite = secret();
      const state: AppState = {
        ...initial,
        onboarded: true,
        myRole: role,
        viewRole: role,
        names: { ...initial.names, [role]: name },
        routines: [],
        agreement: createAgreement(dateKey(this.now(), timeZone)),
        space: { mode: "shared", id: spaceId, paired: false, inviteCode: "", timeZone },
        activity: [
          {
            id: randomUUID(),
            at: this.now().toISOString(),
            by: "system",
            text: "Space created. Waiting for the other person to join.",
          },
        ],
      };
      this.db
        .prepare("INSERT INTO spaces VALUES (?, ?, 1, ?, ?, ?)")
        .run(spaceId, JSON.stringify(state), role, invite, this.now().valueOf() + WEEK);
      const token = this.addMember(spaceId, role, session);
      return { token, snapshot: this.snapshot(this.row(spaceId), role, token) };
    });
  }
  preview(invite: string) {
    const row = this.db.prepare("SELECT * FROM spaces WHERE invite=?").get(invite) as
      Row | undefined;
    if (!row || row.invite_expires <= this.now().valueOf())
      throw new SpaceError(
        410,
        "This invitation is invalid, expired or already used. Ask for a new link.",
      );
    const state = this.state(row);
    return {
      creatorName: state.names[row.creator_role],
      role: row.creator_role === "dom" ? "sub" : "dom",
    };
  }
  join(invite: string, name: string, session = "") {
    return this.transaction(() => {
      this.preview(invite);
      const row = this.db.prepare("SELECT * FROM spaces WHERE invite=?").get(invite) as Row;
      if (this.memberships(session).some((m) => m.space_id === row.id))
        throw new SpaceError(
          409,
          "You already belong to this space. A different person must join.",
        );
      const state = this.state(row),
        role = row.creator_role === "dom" ? "sub" : "dom";
      if (state.pause.active)
        throw new SpaceError(423, "This space is paused. Joining is locked until it resumes.");
      const next: AppState = {
        ...state,
        names: { ...state.names, [role]: name },
        space: { ...state.space, paired: true },
        activity: [
          {
            id: randomUUID(),
            at: this.now().toISOString(),
            by: "system",
            text: "The other person joined. Both can now review the agreement.",
          },
          ...state.activity,
        ],
      };
      this.save(row, next);
      this.db.prepare("UPDATE spaces SET invite=NULL WHERE id=?").run(row.id);
      const token = this.addMember(row.id, role, session);
      return { token, snapshot: this.snapshot(this.row(row.id), role, token) };
    });
  }
  /** One card per relationship this identity belongs to, and nothing else. */
  dashboard(session: string) {
    const now = this.now();
    return this.memberships(session).map((member) => {
      const row = this.row(member.space_id);
      const mine =
        member.role === row.creator_role && row.invite && row.invite_expires > now.valueOf();
      return summarizeSpace(
        row.id,
        this.state(row),
        member.role,
        now,
        mine ? { token: row.invite!, expiresAt: row.invite_expires } : null,
      );
    });
  }
  read(session: string, spaceId?: string) {
    const member = this.member(session, spaceId);
    return this.snapshot(this.row(member.space_id), member.role, session);
  }
  openTelegram(session: string, spaceId: string, routineId: string) {
    return this.transaction(() => {
      const member = this.member(session, spaceId, true);
      try {
        return this.telegram.open(
          this.state(this.row(spaceId)),
          member.role,
          this.now(),
        )(routineId);
      } catch (error) {
        throw new SpaceError(
          400,
          error instanceof Error ? error.message : "Cannot open collection.",
        );
      }
    });
  }
  telegramUpdate(id: number, userId: string, text: string, media: boolean) {
    return this.transaction(() =>
      this.telegram.process(
        id,
        userId,
        text,
        media,
        this.now(),
        (spaceId) => this.state(this.row(spaceId)),
        (spaceId, state) => this.save(this.row(spaceId), state),
      ),
    );
  }
  change(
    session: string,
    revision: number,
    operation: { command: unknown } | { name: string } | { rotate: true },
    spaceId?: string,
  ) {
    return this.transaction(() => {
      const member = this.member(session, spaceId, true),
        row = this.row(member.space_id),
        state = this.state(row);
      const snapshot = this.snapshot(row, member.role, session);
      const command =
        "command" in operation ? (commandSchema.parse(operation.command) as Command) : null;
      // A safety stop always wins even if this browser has an old revision.
      if (revision !== row.revision && command?.type !== "pause")
        throw new SpaceError(
          409,
          "The space changed on the other device. Review the refreshed page and try again.",
          snapshot,
        );
      let next: AppState;
      if (command) {
        if (command.type === "pause" && !state.space.paired)
          throw new SpaceError(
            400,
            "No shared activity has started yet. Invite the other person first.",
            snapshot,
          );
        try {
          next = upgradeAgreement(
            transition({ ...state, myRole: member.role, viewRole: member.role }, command, {
              now: this.now(),
              id: randomUUID,
              random: () => randomBytes(4).readUInt32BE(),
            }),
            this.now(),
          );
        } catch (error) {
          throw new SpaceError(
            400,
            error instanceof Error ? error.message : "Action not allowed.",
            snapshot,
          );
        }
      } else {
        if (state.pause.active)
          throw new SpaceError(423, "Paused: profile and invitation changes are locked.", snapshot);
        if ("rotate" in operation) {
          if (member.role !== row.creator_role || state.space.paired)
            throw new SpaceError(403, "Only the creator can replace an unused invitation.");
          this.db
            .prepare("UPDATE spaces SET invite=?, invite_expires=? WHERE id=?")
            .run(secret(), this.now().valueOf() + WEEK, row.id);
          next = state;
        } else if ("name" in operation)
          next = { ...state, names: { ...state.names, [member.role]: operation.name } };
        else throw new SpaceError(400, "Unknown operation.");
      }
      this.save(row, next);
      return this.snapshot(this.row(row.id), member.role, session);
    });
  }
}
