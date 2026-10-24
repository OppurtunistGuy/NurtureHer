// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleSpaceRequest } from "./space-api.server";
import { SpaceRepository } from "./space-repository.server";
import { invitationLink, invitationToken, type SpaceSnapshot } from "./space-protocol";
import type { Role, Routine } from "./types";

let directory: string, db: SpaceRepository, clock: Date;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "nocturne-test-"));
  clock = new Date("2026-10-23T12:00:00Z");
  db = new SpaceRepository(join(directory, "spaces.sqlite"), () => clock);
});
afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
class BrowserSession {
  cookie = "";
  snapshot!: SpaceSnapshot;
  async request(body?: Record<string, unknown>, selected = this.snapshot?.state.space.id) {
    const response = await handleSpaceRequest(
      new Request(
        `https://nocturne.test/api/space${!body && selected ? `?space=${selected}` : ""}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            origin: "https://nocturne.test",
            "content-type": "application/json",
            cookie: this.cookie,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      ),
      db,
    );
    const value = await response.json();
    if (response.headers.has("set-cookie"))
      this.cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    if (value.state) this.snapshot = value as SpaceSnapshot;
    if (value.snapshot) this.snapshot = value.snapshot as SpaceSnapshot;
    return { response, value };
  }
  create(name = "Maya", role: Role = "dom") {
    return this.request({ op: "create", name, role, adult: true });
  }
  command(command: Record<string, unknown>, revision = this.snapshot.revision) {
    return this.request({
      op: "command",
      revision,
      spaceId: this.snapshot.state.space.id,
      command,
    });
  }
}
async function pair(creatorRole: Role = "dom") {
  const creator = new BrowserSession(),
    partner = new BrowserSession();
  await creator.create("Maya", creatorRole);
  const token = creator.snapshot.invite!.token;
  const result = await partner.request({ op: "join", token, name: "Aria", adult: true });
  expect(result.response.status).toBe(201);
  await creator.request();
  return { creator, partner, token };
}
describe("points API across independent sessions", () => {
  it("persists shared points, prevents role spoofing and keeps other spaces separate", async () => {
    const { creator, partner } = await pair();
    const command = {
      type: "points.award",
      entry: {
        id: "reviewed-reward",
        kind: "reward",
        amount: 50,
        reason: "Reviewed weekly progress",
      },
    };
    expect((await creator.command(command)).response.status).toBe(400);
    await creator.command({ type: "agreement.ack" });
    await partner.request();
    await partner.command({ type: "agreement.ack" });
    await creator.request();
    expect((await creator.command(command)).response.status).toBe(200);
    const result = await partner.request();
    expect(result.value.state.points.ledger[0]).toMatchObject({
      id: "reviewed-reward",
      amount: 50,
      by: "dom",
    });
    expect(
      (await partner.command({ ...command, entry: { ...command.entry, id: "forged" } })).response
        .status,
    ).toBe(400);
    expect((await creator.command(command)).response.status).toBe(400);
    const other = new BrowserSession();
    await other.create("Other Master");
    expect(other.snapshot.state.points?.ledger).toEqual([]);
    expect(
      (
        await other.request({
          op: "command",
          spaceId: creator.snapshot.state.space.id,
          revision: creator.snapshot.revision,
          command,
        })
      ).response.status,
    ).toBe(403);
    await partner.request();
    await partner.command({ type: "pause", signal: "RED", reason: "Check in" });
    await creator.request();
    expect(
      (await creator.command({ ...command, entry: { ...command.entry, id: "paused" } })).response
        .status,
    ).toBe(400);
    db.close();
    db = new SpaceRepository(join(directory, "spaces.sqlite"), () => clock);
    await creator.request();
    expect(creator.snapshot.state.points?.ledger).toHaveLength(1);
    expect(creator.snapshot.state.pause.active).toBe(true);
  });
});

const routine: Routine = {
  id: "check-in",
  title: "Daily check-in",
  instructions: "Write a short update.",
  recurrence: { kind: "daily" },
  windowStart: "09:00",
  windowEnd: "23:00",
  reminderMinutes: null,
  enabled: true,
  requiresAck: false,
  optInDaily: false,
  proof: "text",
  revision: 1,
};

describe("real shared-space requests with independent browser sessions", () => {
  it("submits on the same shared day when the creator is ahead of the UTC server", async () => {
    clock = new Date("2026-10-23T23:30:00Z");
    const creator = new BrowserSession(),
      partner = new BrowserSession();
    await creator.request({
      op: "create",
      name: "Maya",
      role: "dom",
      adult: true,
      timeZone: "Asia/Kolkata",
    });
    await partner.request({
      op: "join",
      name: "Aria",
      token: creator.snapshot.invite!.token,
      adult: true,
    });
    await creator.request();
    await creator.command({
      type: "routine.save",
      routine: { ...routine, recurrence: { kind: "once", date: "2026-10-24" } },
    });
    await creator.command({ type: "agreement.ack" });
    await partner.request();
    await partner.command({ type: "agreement.ack" });
    expect(
      (
        await partner.command({
          type: "submission",
          id: routine.id,
          text: "Today's work completed.",
        })
      ).response.status,
    ).toBe(200);
    expect(partner.snapshot.state.submissions![0]!.date).toBe("2026-10-24");
    expect(partner.snapshot.state.tasks).toHaveProperty("check-in:2026-10-24");
  });
  it.each(["dom", "sub"] as const)(
    "creates as %s, previews, joins the opposite role and restores on both devices",
    async (role) => {
      const creator = new BrowserSession(),
        partner = new BrowserSession();
      const created = await creator.create("Maya", role);
      expect(created.response.status).toBe(201);
      expect(created.response.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict/);
      expect(created.response.headers.get("set-cookie")).toContain("Secure");
      expect(creator.snapshot.state.space.paired).toBe(false);
      expect(creator.snapshot.state.routines).toHaveLength(0);
      const token = creator.snapshot.invite!.token;
      const preview = await partner.request({ op: "preview", token });
      expect(preview.value).toEqual({ creatorName: "Maya", role: role === "dom" ? "sub" : "dom" });
      expect(preview.value).not.toHaveProperty("state");
      await partner.request({ op: "join", token, name: "Aria", adult: true });
      await creator.request();
      expect(creator.snapshot.state.space.id).toBe(partner.snapshot.state.space.id);
      expect(creator.snapshot.state.names).toEqual(partner.snapshot.state.names);
      expect(creator.snapshot.state.space.paired).toBe(true);
      expect(partner.snapshot.state.myRole).not.toBe(role);
      expect(partner.snapshot.invite).toBeNull();
      expect(creator.snapshot.invite).toBeNull();
      db.close();
      db = new SpaceRepository(join(directory, "spaces.sqlite"), () => clock);
      expect((await creator.request()).response.status).toBe(200);
      expect((await partner.request()).response.status).toBe(200);
      expect(creator.snapshot.state.names[role]).toBe("Maya");
    },
  );
  it("allows only one redemption when two people join concurrently", async () => {
    const creator = new BrowserSession();
    await creator.create();
    const token = creator.snapshot.invite!.token;
    const results = await Promise.all(
      [new BrowserSession(), new BrowserSession()].map((person) =>
        person.request({ op: "join", token, name: "Guest", adult: true }),
      ),
    );
    expect(results.map((result) => result.response.status).sort()).toEqual([201, 410]);
    expect((await new BrowserSession().request({ op: "preview", token })).response.status).toBe(
      410,
    );
  });
  it("expires and replaces links without replacing the original space", async () => {
    const creator = new BrowserSession();
    await creator.create();
    const previous = creator.snapshot.invite!.token,
      spaceId = creator.snapshot.state.space.id;
    clock = new Date(clock.valueOf() + 8 * 24 * 60 * 60 * 1000);
    expect(
      (await new BrowserSession().request({ op: "preview", token: previous })).response.status,
    ).toBe(410);
    expect(
      (await creator.request({ op: "rotate", revision: creator.snapshot.revision })).response
        .status,
    ).toBe(200);
    expect(creator.snapshot.state.space.id).toBe(spaceId);
    expect(creator.snapshot.invite!.token).not.toBe(previous);
    expect(
      (await new BrowserSession().request({ op: "preview", token: creator.snapshot.invite!.token }))
        .response.status,
    ).toBe(200);
  });
  it("adds a relationship without overwriting the existing space or cookie", async () => {
    const creator = new BrowserSession();
    await creator.create();
    const before = creator.snapshot.state.space.id;
    const cookie = creator.cookie;
    expect((await creator.create("Other")).response.status).toBe(201);
    expect(creator.cookie).toBe(cookie);
    expect(creator.snapshot.spaces).toHaveLength(2);
    await creator.request(undefined, before);
    expect(creator.snapshot.state.space.id).toBe(before);
  });
  it("rejects expired sessions without changing saved records", async () => {
    const creator = new BrowserSession();
    await creator.create();
    clock = new Date(clock.valueOf() + 31 * 24 * 60 * 60 * 1000);
    expect((await creator.request()).response.status).toBe(401);
  });
  it("updates only the caller's name and exposes it to their partner", async () => {
    const { creator, partner } = await pair();
    expect(
      (
        await partner.request({
          op: "profile",
          name: "Aria updated",
          revision: partner.snapshot.revision,
        })
      ).response.status,
    ).toBe(200);
    await creator.request();
    expect(creator.snapshot.state.names).toEqual({ dom: "Maya", sub: "Aria updated" });
  });
  it("enforces role ownership and completes a check-in through two separate sessions", async () => {
    const { creator, partner } = await pair();
    expect((await partner.command({ type: "routine.save", routine })).response.status).toBe(400);
    expect((await partner.command({ type: "view", role: "dom" })).response.status).toBe(400);
    expect((await creator.command({ type: "routine.save", routine })).response.status).toBe(200);
    await creator.command({ type: "agreement.ack" });
    await partner.request();
    await partner.command({ type: "agreement.ack" });
    const submitted = await partner.command({
      type: "submission",
      id: routine.id,
      text: "Completed my focus block.",
    });
    expect(submitted.response.status).toBe(200);
    await creator.request();
    const proof = creator.snapshot.state.submissions![0]!;
    expect(proof.text).toBe("Completed my focus block.");
    expect(
      (
        await creator.command({
          type: "review",
          id: proof.id,
          decision: "accepted",
          response: "Reviewed.",
        })
      ).response.status,
    ).toBe(200);
    await partner.request();
    expect(Object.values(partner.snapshot.state.tasks)[0]!.status).toBe("completed");
  });
  it("returns fresh state on a stale write and does not duplicate a retry", async () => {
    const { creator, partner } = await pair();
    const staleRevision = partner.snapshot.revision;
    await creator.command({ type: "message", channel: "notes", text: "First note" });
    const stale = await partner.command(
      { type: "message", channel: "notes", text: "Second note" },
      staleRevision,
    );
    expect(stale.response.status).toBe(409);
    expect(partner.snapshot.state.messages).toHaveLength(1);
    await partner.command({ type: "message", channel: "notes", text: "Second note" });
    expect(partner.snapshot.state.messages).toHaveLength(2);
  });
  it("accepts a stale safety stop and locks both devices until discussion and mutual resume", async () => {
    const { creator, partner } = await pair();
    const stale = partner.snapshot.revision;
    await creator.command({ type: "message", channel: "notes", text: "Before pause" });
    expect(
      (await partner.command({ type: "pause", signal: "RED", reason: "Stop" }, stale)).response
        .status,
    ).toBe(200);
    await creator.request();
    for (const person of [creator, partner]) {
      expect(
        (await person.command({ type: "message", channel: "notes", text: "Blocked" })).response
          .status,
      ).toBe(400);
      expect(
        (
          await person.request({
            op: "profile",
            name: "Blocked",
            revision: person.snapshot.revision,
          })
        ).response.status,
      ).toBe(423);
    }
    expect((await creator.command({ type: "resume" })).response.status).toBe(400);
    await creator.command({
      type: "message",
      channel: "discussion",
      text: "Can we adjust timing?",
    });
    await partner.request();
    await partner.command({ type: "message", channel: "discussion", text: "Yes, let's adjust." });
    await creator.request();
    await creator.command({ type: "resume" });
    expect(creator.snapshot.state.pause.active).toBe(true);
    await partner.request();
    await partner.command({ type: "resume" });
    expect(partner.snapshot.state.pause.active).toBe(false);
    await creator.request();
    expect(creator.snapshot.state.pause.active).toBe(false);
  });
  it("does not start an unpaired dynamic that could never mutually resume", async () => {
    const creator = new BrowserSession();
    await creator.create();
    expect((await creator.command({ type: "pause", reason: "" })).response.status).toBe(400);
    expect(creator.snapshot.state.pause.active).toBe(false);
  });
  it("stores and redeems a neutral prompt on the server without sharing it with the Master", async () => {
    const { creator, partner } = await pair();
    await creator.command({
      type: "routine.save",
      routine: { ...routine, proof: "challenge", optInDaily: true },
    });
    await creator.command({ type: "agreement.ack" });
    await partner.request();
    await partner.command({ type: "agreement.ack" });
    await partner.command({ type: "task.prepare", id: routine.id, preparation: "optIn" });
    expect((await partner.command({ type: "challenge", id: routine.id })).response.status).toBe(
      200,
    );
    const challenge = partner.snapshot.state.challenge!;
    expect(challenge.prompt).toBeTruthy();
    await creator.request();
    expect(creator.snapshot.state.challenge).toBeUndefined();
    expect(
      (
        await partner.command({
          type: "submission",
          id: routine.id,
          text: `${challenge.prompt}: done`,
          challengeId: challenge.id,
        })
      ).response.status,
    ).toBe(200);
  });
});

describe("request and invitation boundaries", () => {
  it("keeps multiple Masters and Subs private and derives authority separately in each space", async () => {
    const { creator, partner } = await pair();
    const first = creator.snapshot.state.space.id!;
    await creator.command({ type: "routine.save", routine });
    await creator.command({ type: "message", text: "Only first pair", channel: "notes" });
    await creator.create("Maya second", "dom");
    const second = creator.snapshot.state.space.id!;
    const third = new BrowserSession();
    await third.request({
      op: "join",
      name: "Third",
      token: creator.snapshot.invite!.token,
      adult: true,
    });
    await creator.request();
    await creator.command({
      type: "routine.save",
      routine: { ...routine, title: "Second relationship" },
    });
    expect(creator.snapshot.state.messages).toHaveLength(0);
    expect(third.snapshot.spaces).toHaveLength(1);
    await partner.request();
    expect(partner.snapshot.spaces).toHaveLength(1);
    expect(partner.snapshot.state.routines[0]!.title).toBe(routine.title);
    expect((await partner.request(undefined, second)).response.status).toBe(403);
    const fourth = new BrowserSession();
    await fourth.create("Other Master");
    const other = fourth.snapshot.state.space.id!;
    await creator.request({
      op: "join",
      token: fourth.snapshot.invite!.token,
      name: "Maya sub",
      adult: true,
    });
    expect(creator.snapshot.state.myRole).toBe("sub");
    expect(creator.snapshot.spaces).toHaveLength(3);
    expect((await creator.command({ type: "routine.save", routine })).response.status).toBe(400);
    await creator.request(undefined, first);
    expect(creator.snapshot.state.myRole).toBe("dom");
    expect(creator.snapshot.state.messages[0]!.text).toBe("Only first pair");
    await creator.command({ type: "pause", reason: "Check in" });
    await creator.request(undefined, second);
    expect(creator.snapshot.state.pause.active).toBe(false);
    expect(
      (
        await creator.command({
          type: "message",
          text: "Second pair still active",
          channel: "notes",
        })
      ).response.status,
    ).toBe(200);
    await creator.request(undefined, first);
    expect(creator.snapshot.state.pause.active).toBe(true);
    expect(creator.snapshot.state.messages).toHaveLength(1);
    expect(
      (
        await creator.request({
          op: "command",
          revision: creator.snapshot.revision,
          command: { type: "message", text: "Ambiguous", channel: "notes" },
        })
      ).response.status,
    ).toBe(400);
    await fourth.request(undefined, other);
    expect(fourth.snapshot.state.pause.active).toBe(false);
    expect(fourth.snapshot.spaces).toHaveLength(1);
  });
  it("allows a Sub to join two Masters without sharing agreements or tasks", async () => {
    const first = new BrowserSession(),
      second = new BrowserSession(),
      sub = new BrowserSession();
    await first.create("First");
    const firstId = first.snapshot.state.space.id!;
    await sub.request({
      op: "join",
      token: first.snapshot.invite!.token,
      name: "Sub",
      adult: true,
    });
    await sub.command({ type: "agreement.ack" });
    await second.create("Second");
    await sub.request({
      op: "join",
      token: second.snapshot.invite!.token,
      name: "Sub alias",
      adult: true,
    });
    expect(sub.snapshot.spaces).toHaveLength(2);
    expect(sub.snapshot.spaces.every((s) => s.role === "sub")).toBe(true);
    expect(sub.snapshot.state.agreement.ack.sub).toBeNull();
    await sub.request(undefined, firstId);
    expect(sub.snapshot.state.agreement.ack.sub).not.toBeNull();
    expect(sub.snapshot.state.names.sub).toBe("Sub");
  });
  it("cannot join your own invitation or use a forged space ID", async () => {
    const creator = new BrowserSession();
    await creator.create();
    const token = creator.snapshot.invite!.token;
    expect(
      (await creator.request({ op: "join", token, name: "Same person", adult: true })).response
        .status,
    ).toBe(409);
    const stranger = new BrowserSession();
    await stranger.create();
    expect(
      (
        await creator.request({
          op: "profile",
          spaceId: stranger.snapshot.state.space.id,
          revision: 1,
          name: "Intrusion",
        })
      ).response.status,
    ).toBe(403);
    expect(
      (
        await creator.request({
          op: "profile",
          spaceId: "not-an-id",
          revision: 1,
          name: "Intrusion",
        })
      ).response.status,
    ).toBe(400);
  });
  it("migrates legacy membership records with a consistent backup and preserves both sessions and data", async () => {
    const { creator, partner } = await pair();
    await creator.command({ type: "message", text: "Existing private note", channel: "notes" });
    const before = creator.snapshot.state;
    db.close();
    const legacy = new DatabaseSync(join(directory, "spaces.sqlite"));
    legacy.exec(`ALTER TABLE members RENAME TO current_members;
      CREATE TABLE members (session_hash TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),role TEXT NOT NULL,expires INTEGER NOT NULL,UNIQUE(space_id,role));
      INSERT INTO members SELECT * FROM current_members; DROP TABLE current_members;`);
    legacy.close();
    db = new SpaceRepository(join(directory, "spaces.sqlite"), () => clock);
    await creator.request();
    await partner.request();
    expect(creator.snapshot.state).toEqual(before);
    expect(partner.snapshot.state.messages[0]!.text).toBe("Existing private note");
    const backups = readdirSync(directory).filter((f) => f.includes("before-multiple-spaces"));
    expect(backups).toHaveLength(1);
    const backup = new DatabaseSync(join(directory, backups[0]!), { readOnly: true });
    expect(
      (backup.prepare("SELECT COUNT(*) AS count FROM members").get() as { count: number }).count,
    ).toBe(2);
    backup.close();
    await creator.create("Another");
    expect(creator.snapshot.spaces).toHaveLength(2);
    db.close();
    db = new SpaceRepository(join(directory, "spaces.sqlite"), () => clock);
    expect(readdirSync(directory).filter((f) => f.includes("before-multiple-spaces"))).toHaveLength(
      1,
    );
  });
  it("authorizes AI drafting per space and reports missing setup without changing any routine", async () => {
    const { creator, partner } = await pair();
    const body = {
      op: "draft",
      spaceId: creator.snapshot.state.space.id,
      prompt: "Weekday study check-in",
    };
    expect((await partner.request(body)).response.status).toBe(403);
    expect((await new BrowserSession().request(body)).response.status).toBe(401);
    const result = await creator.request(body);
    expect(result.response.status).toBe(503);
    expect(result.value.error).toContain("AI drafting is not configured");
    await creator.command({ type: "pause", reason: "Stop" });
    expect((await creator.request(body)).response.status).toBe(423);
    expect(creator.snapshot.state.routines).toHaveLength(0);
  });
  it("rejects unsupported timezones", async () => {
    expect(
      (
        await new BrowserSession().request({
          op: "create",
          name: "Maya",
          role: "dom",
          adult: true,
          timeZone: "Invalid/Moon",
        })
      ).response.status,
    ).toBe(400);
  });
  it("denies reading another space without a member session", async () => {
    await new BrowserSession().create();
    expect((await new BrowserSession().request()).response.status).toBe(401);
  });
  it("denies cross-site mutations", async () => {
    const response = await handleSpaceRequest(
      new Request("https://nocturne.test/api/space", {
        method: "POST",
        headers: { origin: "https://other.test", "content-type": "application/json" },
        body: JSON.stringify({ op: "create", name: "Test", role: "dom", adult: true }),
      }),
      db,
    );
    expect(response.status).toBe(403);
  });
  it.each([
    { name: "   ", role: "dom", adult: true },
    { name: "Name", role: "dom", adult: false },
    { name: "Name", role: "owner", adult: true },
  ])("rejects invalid creation fields %j", async (fields) => {
    expect((await new BrowserSession().request({ op: "create", ...fields })).response.status).toBe(
      400,
    );
  });
  it("rejects oversized requests", async () => {
    expect(
      (await new BrowserSession().request({ op: "preview", token: "x".repeat(40_000) })).response
        .status,
    ).toBe(413);
  });
  it("keeps invitation secrets out of the URL request path and includes no private record text", () => {
    const token = "a".repeat(64),
      link = invitationLink("https://nocturne.test", token);
    expect(new URL(link).pathname).toBe("/");
    expect(new URL(link).search).toBe("");
    expect(invitationToken(link)).toBe(token);
    expect(invitationToken("not a link")).toBe("");
    expect(invitationToken("https://nocturne.test/#invite=short")).toBe("");
  });
});
