// Account storage shared by the local SQLite and remote libSQL repositories.
// Password hashing happens outside these methods (see passwords.server.ts) so a
// database transaction never waits on slow crypto work.
import { createHash, randomBytes, randomUUID } from "node:crypto";

export type AsyncSql = {
  prepare(sql: string): {
    get: (...args: (string | number | null)[]) => Promise<unknown>;
    all: (...args: (string | number | null)[]) => Promise<unknown[]>;
    run: (...args: (string | number | null)[]) => Promise<void>;
  };
};

export type Account = { id: string; email: string; name: string };
type UserRow = Account & { password_hash: string };

export const AUTH_SESSION_SECONDS = 30 * 24 * 60 * 60;
/** Account memberships never expire on their own; leaving (Phase 4) removes them. */
export const ACCOUNT_MEMBERSHIP_EXPIRES = 253402300799000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
export const IP_FAILURE_LIMIT = 20;
export const GLOBAL_SPIKE = 300;
export const RESET_TOKEN_MINUTES = 30;
export const RESET_PER_EMAIL = 3;
export const RESET_PER_IP = 10;
const ONE_HOUR = 60 * 60 * 1000;

export const AUTH_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, created INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL, created INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id)",
  "CREATE TABLE IF NOT EXISTS login_failures (key TEXT NOT NULL, at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS login_failures_key ON login_failures(key, at)",
  // A separate table, so code still running without accounts never sees a changed members table.
  // Only a hash of each emailed reset token is stored; a token works once and expires quickly.
  "CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL, created INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id)",
  "CREATE TABLE IF NOT EXISTS member_accounts (space_id TEXT NOT NULL, role TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(space_id, role))",
];

export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
/** Server-side identity for an account. Never derived from anything a browser sends. */
export const principal = (userId: string) => `acct:${userId}`;
export const isPrincipal = (value: string) => value.startsWith("acct:");
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export class AuthCore {
  constructor(
    private db: AsyncSql,
    private now: () => Date,
  ) {}

  private get time() {
    return this.now().valueOf();
  }

  async findUserByEmail(email: string): Promise<UserRow | undefined> {
    return (await this.db
      .prepare("SELECT id, email, name, password_hash FROM users WHERE email=?")
      .get(normalizeEmail(email))) as UserRow | undefined;
  }

  async userWithHash(userId: string): Promise<UserRow | undefined> {
    return (await this.db
      .prepare("SELECT id, email, name, password_hash FROM users WHERE id=?")
      .get(userId)) as UserRow | undefined;
  }

  /** Returns undefined when the email is already registered. */
  async createUser(
    email: string,
    name: string,
    passwordHash: string,
  ): Promise<Account | undefined> {
    if (await this.findUserByEmail(email)) return undefined;
    const user = { id: randomUUID(), email: normalizeEmail(email), name: name.trim() };
    await this.db
      .prepare("INSERT INTO users (id, email, name, password_hash, created) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, user.email, user.name, passwordHash, this.time);
    return user;
  }

  async createSession(userId: string) {
    const token = newToken();
    await this.db
      .prepare(
        "INSERT INTO auth_sessions (token_hash, user_id, expires, created) VALUES (?, ?, ?, ?)",
      )
      .run(hashToken(token), userId, this.time + AUTH_SESSION_SECONDS * 1000, this.time);
    return token;
  }

  async resolveSession(token: string): Promise<Account | undefined> {
    return (await this.db
      .prepare(
        "SELECT users.id AS id, users.email AS email, users.name AS name FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id WHERE auth_sessions.token_hash=? AND auth_sessions.expires>?",
      )
      .get(hashToken(token), this.time)) as Account | undefined;
  }

  async deleteSession(token: string) {
    await this.db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(hashToken(token));
  }

  /** Signs out every other device; the session in `keepToken` stays valid. */
  async deleteOtherSessions(userId: string, keepToken: string) {
    await this.db
      .prepare("DELETE FROM auth_sessions WHERE user_id=? AND token_hash<>?")
      .run(userId, hashToken(keepToken));
  }

  async setPassword(userId: string, passwordHash: string) {
    await this.db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(passwordHash, userId);
  }

  async rename(userId: string, name: string) {
    await this.db.prepare("UPDATE users SET name=? WHERE id=?").run(name.trim(), userId);
  }

  /**
   * Throttling without hard lockout. Keys: the client IP, the email+IP pair and the whole service.
   * An attacker on other IPs never delays the real owner, because delays are per email+IP.
   */
  async throttle(email: string, ip: string): Promise<{ retryAfter: number; slow: boolean }> {
    const since = this.time - FIFTEEN_MINUTES;
    const count = async (key: string, from: number) =>
      Number(
        (
          (await this.db
            .prepare("SELECT COUNT(*) AS n FROM login_failures WHERE key=? AND at>?")
            .get(key, from)) as { n: number | bigint }
        ).n,
      );
    const ipCount = await count(`ip:${ip}`, since);
    if (ipCount >= IP_FAILURE_LIMIT) {
      const oldest = (await this.db
        .prepare("SELECT MIN(at) AS at FROM login_failures WHERE key=? AND at>?")
        .get(`ip:${ip}`, since)) as { at: number };
      return {
        retryAfter: Math.ceil((Number(oldest.at) + FIFTEEN_MINUTES - this.time) / 1000),
        slow: false,
      };
    }
    const pair = `pair:${normalizeEmail(email)}|${ip}`;
    const pairCount = await count(pair, since);
    if (pairCount > 0) {
      const last = (await this.db
        .prepare("SELECT MAX(at) AS at FROM login_failures WHERE key=?")
        .get(pair)) as { at: number };
      const delay = Math.min(60, 2 ** (pairCount - 1)) * 1000;
      const wait = Number(last.at) + delay - this.time;
      if (wait > 0) return { retryAfter: Math.ceil(wait / 1000), slow: false };
    }
    const slow = (await count("global", this.time - FIVE_MINUTES)) >= GLOBAL_SPIKE;
    return { retryAfter: 0, slow };
  }

  async recordFailure(email: string, ip: string) {
    const statement = this.db.prepare("INSERT INTO login_failures (key, at) VALUES (?, ?)");
    await statement.run(`ip:${ip}`, this.time);
    await statement.run(`pair:${normalizeEmail(email)}|${ip}`, this.time);
    await statement.run("global", this.time);
    await this.db
      .prepare("DELETE FROM login_failures WHERE at<?")
      .run(this.time - 24 * 60 * 60 * 1000);
  }

  async clearFailures(email: string, ip: string) {
    await this.db
      .prepare("DELETE FROM login_failures WHERE key=?")
      .run(`pair:${normalizeEmail(email)}|${ip}`);
  }

  /**
   * Counts a reset request and says whether it may go ahead. Limits are per email and per IP over
   * an hour, so one person can't fill an inbox and one address can't be used to probe many emails.
   * `ipBlocked` is safe to show; an email limit is never shown (it would reveal the account).
   */
  async resetAllowance(
    email: string,
    ip: string,
  ): Promise<{ ipBlocked: boolean; emailBlocked: boolean }> {
    const since = this.time - ONE_HOUR;
    const count = async (key: string) =>
      Number(
        (
          (await this.db
            .prepare("SELECT COUNT(*) AS n FROM login_failures WHERE key=? AND at>?")
            .get(key, since)) as { n: number | bigint }
        ).n,
      );
    const ipKey = `reset-ip:${ip}`,
      emailKey = `reset-email:${normalizeEmail(email)}`;
    const ipBlocked = (await count(ipKey)) >= RESET_PER_IP;
    const emailBlocked = (await count(emailKey)) >= RESET_PER_EMAIL;
    const statement = this.db.prepare("INSERT INTO login_failures (key, at) VALUES (?, ?)");
    await statement.run(ipKey, this.time);
    await statement.run(emailKey, this.time);
    return { ipBlocked, emailBlocked };
  }

  /** One live reset token per account: asking again replaces the earlier link. */
  async createReset(userId: string) {
    const token = newToken();
    await this.db.prepare("DELETE FROM password_resets WHERE user_id=?").run(userId);
    await this.db
      .prepare(
        "INSERT INTO password_resets (token_hash, user_id, expires, created) VALUES (?, ?, ?, ?)",
      )
      .run(hashToken(token), userId, this.time + RESET_TOKEN_MINUTES * 60 * 1000, this.time);
    return token;
  }

  async discardReset(userId: string) {
    await this.db.prepare("DELETE FROM password_resets WHERE user_id=?").run(userId);
  }

  /**
   * Uses a reset token once: sets the new password, ends every sign-in on every device, and
   * removes the token. Returns the account (for the notice email), or undefined when the token
   * is unknown, used or expired.
   */
  async completeReset(
    token: string,
    passwordHash: string,
  ): Promise<{ email: string; name: string } | undefined> {
    const row = (await this.db
      .prepare("SELECT user_id, expires FROM password_resets WHERE token_hash=?")
      .get(hashToken(token))) as { user_id: string; expires: number } | undefined;
    if (!row) return undefined;
    await this.db.prepare("DELETE FROM password_resets WHERE user_id=?").run(row.user_id);
    if (Number(row.expires) <= this.time) return undefined;
    await this.setPassword(row.user_id, passwordHash);
    await this.db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(row.user_id);
    const user = await this.userWithHash(row.user_id);
    return user ? { email: user.email, name: user.name } : undefined;
  }

  /**
   * Moves a browser's unclaimed legacy memberships to an account. Called only after a
   * successful login or registration. A membership already linked to any account is never
   * moved, and a space the account already belongs to is left untouched.
   */
  async claim(userId: string, legacySession: string) {
    if (!/^[a-f0-9]{64}$/.test(legacySession)) return 0;
    const owner = hashToken(principal(userId));
    const rows = (await this.db
      .prepare(
        "SELECT space_id, role FROM members WHERE session_hash=? AND expires>? AND space_id NOT IN (SELECT space_id FROM members WHERE session_hash=?) AND NOT EXISTS (SELECT 1 FROM member_accounts WHERE member_accounts.space_id=members.space_id AND member_accounts.role=members.role)",
      )
      .all(hashToken(legacySession), this.time, owner)) as { space_id: string; role: string }[];
    for (const row of rows) {
      await this.db
        .prepare("UPDATE members SET session_hash=?, expires=? WHERE session_hash=? AND space_id=?")
        .run(owner, ACCOUNT_MEMBERSHIP_EXPIRES, hashToken(legacySession), row.space_id);
      await this.db
        .prepare("INSERT INTO member_accounts (space_id, role, user_id) VALUES (?, ?, ?)")
        .run(row.space_id, row.role, userId);
    }
    return rows.length;
  }

  /** How many spaces an unclaimed browser cookie still opens. */
  async legacyCount(legacySession: string) {
    if (!/^[a-f0-9]{64}$/.test(legacySession)) return 0;
    const row = (await this.db
      .prepare("SELECT COUNT(*) AS n FROM members WHERE session_hash=? AND expires>?")
      .get(hashToken(legacySession), this.time)) as { n: number | bigint };
    return Number(row.n);
  }
}

/** Wraps node:sqlite's synchronous statements in the async shape AuthCore expects. */
export function asyncSql(db: {
  prepare(sql: string): {
    get(...args: (string | number | null)[]): unknown;
    all(...args: (string | number | null)[]): unknown[];
    run(...args: (string | number | null)[]): unknown;
  };
}): AsyncSql {
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        get: async (...args) => statement.get(...args),
        all: async (...args) => statement.all(...args),
        run: async (...args) => {
          statement.run(...args);
        },
      };
    },
  };
}
