import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { createInitialState } from "./initial-state";
import { savedStateSchema } from "./storage";
import { transition, type Command } from "./engine";
import { createAgreement, upgradeAgreement } from "./agreement-document";
import { dateKey } from "./logic";
import type { AppState, Role } from "./types";
import type { SpaceSnapshot } from "./space-protocol";

const id = z.string().min(1).max(100);
const commandSchema = z.discriminatedUnion("type", [
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
const bodySchema = savedStateSchema.extend({
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
      CREATE TABLE IF NOT EXISTS members (session_hash TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), role TEXT NOT NULL, expires INTEGER NOT NULL, UNIQUE(space_id, role));`);
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
  private member(session: string): Member {
    const found = this.db
      .prepare("SELECT space_id, role FROM members WHERE session_hash=? AND expires>?")
      .get(hash(session), this.now().valueOf()) as Member | undefined;
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
  private snapshot(row: Row, role: Role): SpaceSnapshot {
    const current = this.state(row);
    return {
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
  private available(session: string) {
    if (
      session &&
      this.db
        .prepare("SELECT 1 FROM members WHERE session_hash=? AND expires>?")
        .get(hash(session), this.now().valueOf())
    )
      throw new SpaceError(
        409,
        "This browser already belongs to a space. Open it, or use another browser profile for testing.",
      );
  }
  private addMember(spaceId: string, role: Role) {
    const token = secret();
    this.db
      .prepare("INSERT INTO members VALUES (?, ?, ?, ?)")
      .run(hash(token), spaceId, role, this.now().valueOf() + SESSION_SECONDS * 1000);
    return token;
  }
  create(name: string, role: Role, session = "", timeZone = "UTC") {
    return this.transaction(() => {
      this.available(session);
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
      const token = this.addMember(spaceId, role);
      return { token, snapshot: this.snapshot(this.row(spaceId), role) };
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
      this.available(session);
      this.preview(invite);
      const row = this.db.prepare("SELECT * FROM spaces WHERE invite=?").get(invite) as Row;
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
      const token = this.addMember(row.id, role);
      return { token, snapshot: this.snapshot(this.row(row.id), role) };
    });
  }
  read(session: string) {
    const member = this.member(session);
    return this.snapshot(this.row(member.space_id), member.role);
  }
  change(
    session: string,
    revision: number,
    operation: { command: unknown } | { name: string } | { rotate: true },
  ) {
    return this.transaction(() => {
      const member = this.member(session),
        row = this.row(member.space_id),
        state = this.state(row);
      const snapshot = this.snapshot(row, member.role);
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
      return this.snapshot(this.row(row.id), member.role);
    });
  }
}
