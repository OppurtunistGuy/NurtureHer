// Remote persistence uses the same domain transitions and schemas as the local repository.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createInitialState } from "./initial-state";
import { commandSchema, bodySchema, SpaceError, SESSION_SECONDS } from "./space-repository.server";
import { transition, type Command } from "./engine";
import { createAgreement, upgradeAgreement } from "./agreement-document";
import { dateKey } from "./logic";
import type { AppState, Role } from "./types";
import type { SpaceSnapshot } from "./space-protocol";
import { RemoteTelegramProofStore } from "./remote-telegram.server";
import { telegramConfigured } from "./telegram-proof.server";
import type { RemoteSql } from "./remote-storage.server";
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
export class RemoteRepositoryCore {
  constructor(
    private db: RemoteSql,
    private now: () => Date,
  ) {
    this.telegram = new RemoteTelegramProofStore(db);
  }
  private telegram: RemoteTelegramProofStore;
  private transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
  private async memberships(session: string): Promise<Member[]> {
    return (await this.db
      .prepare(
        "SELECT space_id, role FROM members WHERE session_hash=? AND expires>? ORDER BY rowid",
      )
      .all(hash(session), this.now().valueOf())) as unknown as Member[];
  }
  private async member(session: string, spaceId?: string, writing = false): Promise<Member> {
    const memberships = await this.memberships(session);
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
  private async row(spaceId: string): Promise<Row> {
    const row = (await this.db.prepare("SELECT * FROM spaces WHERE id=?").get(spaceId)) as
      Row | undefined;
    if (!row) throw new SpaceError(404, "This space is unavailable.");
    return row;
  }
  private state(row: Row): AppState {
    return bodySchema.parse(JSON.parse(row.body)) as AppState;
  }
  private async snapshot(row: Row, role: Role, session: string): Promise<SpaceSnapshot> {
    const current = this.state(row);
    return {
      telegram: {
        configured: telegramConfigured(),
        proofs: await this.telegram.list(row.id, this.now()),
      },
      spaces: await Promise.all(
        (await this.memberships(session)).map(async (member) => {
          const state = this.state(await this.row(member.space_id));
          return {
            id: member.space_id,
            role: member.role,
            partnerName: state.names[member.role === "dom" ? "sub" : "dom"],
            paired: state.space.paired,
            paused: state.pause.active,
          };
        }),
      ),
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
  private async save(row: Row, state: AppState) {
    // Validate the resulting domain record before committing it.
    const validated = bodySchema.parse(state);
    await this.db
      .prepare("UPDATE spaces SET body=?, revision=revision+1 WHERE id=?")
      .run(JSON.stringify(validated), row.id);
  }
  private async addMember(spaceId: string, role: Role, session: string) {
    const token = (await this.memberships(session)).length ? session : secret();
    // Keep one anonymous identity across its private relationships.
    await this.db
      .prepare("UPDATE members SET expires=? WHERE session_hash=?")
      .run(this.now().valueOf() + SESSION_SECONDS * 1000, hash(token));
    await this.db
      .prepare("INSERT INTO members VALUES (?, ?, ?, ?)")
      .run(hash(token), spaceId, role, this.now().valueOf() + SESSION_SECONDS * 1000);
    return token;
  }
  async create(name: string, role: Role, session = "", timeZone = "UTC") {
    return this.transaction(async () => {
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
      await this.db
        .prepare("INSERT INTO spaces VALUES (?, ?, 1, ?, ?, ?)")
        .run(spaceId, JSON.stringify(state), role, invite, this.now().valueOf() + WEEK);
      const token = await this.addMember(spaceId, role, session);
      return { token, snapshot: await this.snapshot(await this.row(spaceId), role, token) };
    });
  }
  async preview(invite: string) {
    const row = (await this.db.prepare("SELECT * FROM spaces WHERE invite=?").get(invite)) as
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
  async join(invite: string, name: string, session = "") {
    return this.transaction(async () => {
      await this.preview(invite);
      const row = (await this.db
        .prepare("SELECT * FROM spaces WHERE invite=?")
        .get(invite)) as unknown as Row;
      if ((await this.memberships(session)).some((m) => m.space_id === row.id))
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
      await this.save(row, next);
      await this.db.prepare("UPDATE spaces SET invite=NULL WHERE id=?").run(row.id);
      const token = await this.addMember(row.id, role, session);
      return { token, snapshot: await this.snapshot(await this.row(row.id), role, token) };
    });
  }
  async read(session: string, spaceId?: string) {
    const member = await this.member(session, spaceId);
    return await this.snapshot(await this.row(member.space_id), member.role, session);
  }
  async openTelegram(session: string, spaceId: string, routineId: string) {
    return this.transaction(async () => {
      const member = await this.member(session, spaceId, true);
      try {
        return await this.telegram.open(
          this.state(await this.row(spaceId)),
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
  async telegramUpdate(id: number, userId: string, text: string, media: boolean) {
    return this.transaction(
      async () =>
        await this.telegram.process(
          id,
          userId,
          text,
          media,
          this.now(),
          async (spaceId) => this.state(await this.row(spaceId)),
          async (spaceId, state) => await this.save(await this.row(spaceId), state),
        ),
    );
  }
  async change(
    session: string,
    revision: number,
    operation:
      | {
          command: unknown;
        }
      | {
          name: string;
        }
      | {
          rotate: true;
        },
    spaceId?: string,
  ) {
    return this.transaction(async () => {
      const member = await this.member(session, spaceId, true),
        row = await this.row(member.space_id),
        state = this.state(row);
      const snapshot = await this.snapshot(row, member.role, session);
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
          await this.db
            .prepare("UPDATE spaces SET invite=?, invite_expires=? WHERE id=?")
            .run(secret(), this.now().valueOf() + WEEK, row.id);
          next = state;
        } else if ("name" in operation)
          next = { ...state, names: { ...state.names, [member.role]: operation.name } };
        else throw new SpaceError(400, "Unknown operation.");
      }
      await this.save(row, next);
      return await this.snapshot(await this.row(row.id), member.role, session);
    });
  }
}
