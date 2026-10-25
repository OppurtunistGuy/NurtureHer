// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { SpaceRepository } from "./space-repository.server";
import { RemoteSpaceRepository, type SpaceStorage } from "./remote-storage.server";
import { ApiBrowser } from "./api-browser.test-helper";
import { matchesFilter, type DashboardCard } from "./dashboard";
import type { Routine } from "./types";

let directory: string, clock: Date, db: SpaceStorage & { close(): void };
const browser = (ip?: string) => new ApiBrowser(() => db, ip);
const routine = (id: string, title: string): Routine => ({
  id,
  title,
  instructions: "Write a short update.",
  recurrence: { kind: "daily" },
  windowStart: "00:00",
  windowEnd: "23:59",
  reminderMinutes: null,
  enabled: true,
  requiresAck: false,
  optInDaily: false,
  proof: "text",
  revision: 1,
});

/** One Master with three Subs in different states, and an unrelated pair. */
async function threeSubs() {
  const master = browser();
  await master.register("master@example.test", "Priya");
  const subs: { person: ApiBrowser; spaceId: string; name: string }[] = [];
  for (const name of ["Aria", "Bea", "Cai"]) {
    const created = await master.create("Priya");
    const spaceId = created.body.state.space.id as string;
    const person = browser(`198.51.100.${subs.length + 1}`);
    await person.register(`${name.toLowerCase()}@example.test`, name);
    expect((await person.join(created.body.invite.token, name)).status).toBe(201);
    await master.command(spaceId, { type: "agreement.ack" });
    await person.command(spaceId, { type: "agreement.ack" });
    subs.push({ person, spaceId, name });
  }
  const [aria, bea, cai] = subs as [(typeof subs)[0], (typeof subs)[0], (typeof subs)[0]];
  // Aria: two routines today, one checked in and waiting for review.
  await master.command(aria.spaceId, { type: "routine.save", routine: routine("r1", "Morning") });
  await master.command(aria.spaceId, { type: "routine.save", routine: routine("r2", "Evening") });
  expect(
    (await aria.person.command(aria.spaceId, { type: "submission", id: "r1", text: "Done." }))
      .status,
  ).toBe(200);
  // Bea: one routine, checked in and accepted; 60 reward points and 5 punishment points.
  await master.command(bea.spaceId, { type: "routine.save", routine: routine("b1", "Study") });
  await bea.person.command(bea.spaceId, { type: "submission", id: "b1", text: "Finished." });
  const submission = (await master.open(bea.spaceId)).body.state.submissions[0];
  await master.command(bea.spaceId, {
    type: "review",
    id: submission.id,
    decision: "accepted",
    response: "Good.",
  });
  await master.command(bea.spaceId, {
    type: "points.award",
    entry: { id: "p1", kind: "reward", amount: 60, reason: "Steady week" },
  });
  await master.command(bea.spaceId, {
    type: "points.award",
    entry: { id: "p2", kind: "punishment", amount: 5, reason: "Late start" },
  });
  // Cai: paused with RED.
  await cai.person.command(cai.spaceId, { type: "pause", reason: "Need a break", signal: "RED" });
  // A fourth relationship still waiting for its Sub.
  const waiting = await master.create("Priya");
  // An unrelated Master and Sub.
  const stranger = browser("192.0.2.50");
  await stranger.register("stranger@example.test", "Zed");
  const strangerSpace = await stranger.create("Zed");
  return {
    master,
    aria,
    bea,
    cai,
    stranger,
    waitingId: waiting.body.state.space.id as string,
    strangerSpace,
  };
}

for (const backend of ["local SQLite", "remote libSQL"] as const) {
  describe(`dashboard (${backend})`, () => {
    beforeEach(() => {
      directory = mkdtempSync(join(tmpdir(), "boundsome-dashboard-"));
      clock = new Date("2026-10-25T06:00:00Z");
      db =
        backend === "local SQLite"
          ? new SpaceRepository(join(directory, "spaces.sqlite"), () => clock)
          : new RemoteSpaceRepository(
              createClient({ url: `file:${join(directory, "remote.sqlite")}` }),
              () => clock,
            );
    });
    afterEach(() => {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    });

    it("shows correct numbers on every card for a Master with three Subs", async () => {
      const { master, aria, bea, cai, waitingId } = await threeSubs();
      const { status, body } = await master.dashboard();
      expect(status).toBe(200);
      const cards = body.cards as DashboardCard[];
      expect(cards).toHaveLength(4);
      const byId = (id: string) => cards.find((card) => card.id === id)!;
      expect(byId(aria.spaceId)).toMatchObject({
        myRole: "dom",
        partnerName: "Aria",
        paired: true,
        paused: false,
        today: { completed: 0, pending: 2, total: 2 },
        pendingReview: 1,
        latestCheckIn: { title: "Morning" },
        agreement: "acknowledged",
        invite: null,
      });
      expect(byId(bea.spaceId)).toMatchObject({
        partnerName: "Bea",
        today: { completed: 1, pending: 0, total: 1 },
        pendingReview: 0,
        rewards: 60,
        outstandingPunishment: 5,
        level: "Finding rhythm",
      });
      expect(byId(cai.spaceId)).toMatchObject({
        partnerName: "Cai",
        paused: true,
        pauseSignal: "RED",
      });
      expect(byId(waitingId)).toMatchObject({ paired: false });
      expect(byId(waitingId).invite?.token).toMatch(/^[a-f0-9]{64}$/);
      // Filters pick the right relationships.
      const pick = (filter: Parameters<typeof matchesFilter>[1]) =>
        cards.filter((card) => matchesFilter(card, filter)).map((card) => card.partnerName);
      expect(pick("review")).toEqual(["Aria"]);
      expect(pick("paused")).toEqual(["Cai"]);
      expect(pick("waiting")).toHaveLength(1);
      expect(pick("agreement")).toEqual([]);
    });

    it("gives a Sub only their own relationship and never the Master's other Subs", async () => {
      const { aria, bea, cai } = await threeSubs();
      const cards = (await aria.person.dashboard()).body.cards as DashboardCard[];
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({ id: aria.spaceId, myRole: "sub", partnerName: "Priya" });
      const text = JSON.stringify(cards);
      for (const other of [bea, cai]) {
        expect(text).not.toContain(other.spaceId);
        expect(text).not.toContain(other.name);
      }
      // A Sub never sees the Master's invitation for a different relationship.
      expect(cards[0]!.invite).toBeNull();
    });

    it("keeps an unrelated Master's relationships out of the dashboard", async () => {
      const { master, stranger, strangerSpace } = await threeSubs();
      const mine = JSON.stringify((await master.dashboard()).body);
      expect(mine).not.toContain(strangerSpace.body.state.space.id);
      expect(mine).not.toContain("Zed");
      const theirs = (await stranger.dashboard()).body.cards as DashboardCard[];
      expect(theirs).toHaveLength(1);
      expect(theirs[0]!.id).toBe(strangerSpace.body.state.space.id);
    });

    it("refuses the dashboard when signed out", async () => {
      const { master } = await threeSubs();
      await master.logout();
      expect((await master.dashboard()).status).toBe(401);
      expect((await browser().dashboard()).status).toBe(401);
    });

    it("returns an empty list for a new account", async () => {
      const person = browser();
      await person.register("new@example.test");
      expect((await person.dashboard()).body.cards).toEqual([]);
    });
  });
}
