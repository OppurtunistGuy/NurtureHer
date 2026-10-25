// @vitest-environment node
// Phase 3 permission rules from the spec, checked against the real API on both storages.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { SpaceRepository } from "./space-repository.server";
import { RemoteSpaceRepository, type SpaceStorage } from "./remote-storage.server";
import { ApiBrowser } from "./api-browser.test-helper";
import type { Routine } from "./types";

let directory: string, db: SpaceStorage & { close(): void };
const browser = (ip?: string) => new ApiBrowser(() => db, ip);
const routine: Routine = {
  id: "only-a",
  title: "Only for A",
  instructions: "Short update.",
  recurrence: { kind: "daily" },
  windowStart: "00:00",
  windowEnd: "23:59",
  reminderMinutes: null,
  enabled: true,
  requiresAck: false,
  optInDaily: false,
  proof: "text",
  revision: 1,
};

async function setup() {
  const master = browser(),
    other = browser("192.0.2.9"),
    subA = browser("198.51.100.1"),
    subB = browser("198.51.100.2");
  await master.register("m@example.test", "Priya");
  await other.register("o@example.test", "Zed");
  await subA.register("a@example.test", "Aria");
  await subB.register("b@example.test", "Bea");
  const pair = async (sub: ApiBrowser, name: string) => {
    const created = await master.create("Priya");
    await sub.join(created.body.invite.token, name);
    const id = created.body.state.space.id as string;
    await master.command(id, { type: "agreement.ack" });
    await sub.command(id, { type: "agreement.ack" });
    return id;
  };
  const a = await pair(subA, "Aria"),
    b = await pair(subB, "Bea");
  const zed = (await other.create("Zed")).body.state.space.id as string;
  return { master, other, subA, subB, a, b, zed };
}

for (const backend of ["local SQLite", "remote libSQL"] as const) {
  describe(`per-Sub profile permissions (${backend})`, () => {
    beforeEach(() => {
      directory = mkdtempSync(join(tmpdir(), "boundsome-profile-"));
      db =
        backend === "local SQLite"
          ? new SpaceRepository(join(directory, "spaces.sqlite"))
          : new RemoteSpaceRepository(createClient({ url: `file:${join(directory, "r.sqlite")}` }));
    });
    afterEach(() => {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    });

    it("assigns to Sub A only, then reviews Sub B, on one signed-in account", async () => {
      const { master, subB, a, b } = await setup();
      expect((await master.command(a, { type: "routine.save", routine })).status).toBe(200);
      await master.command(b, {
        type: "routine.save",
        routine: { ...routine, id: "b1", title: "B" },
      });
      await subB.command(b, { type: "submission", id: "b1", text: "Done." });
      const open = (await master.open(b)).body.state.submissions[0];
      expect(
        (
          await master.command(b, {
            type: "review",
            id: open.id,
            decision: "accepted",
            response: "",
          })
        ).status,
      ).toBe(200);
      const stateA = (await master.open(a)).body.state,
        stateB = (await master.open(b)).body.state;
      expect(stateA.routines.map((r: Routine) => r.id)).toEqual(["only-a"]);
      expect(stateB.routines.map((r: Routine) => r.id)).toEqual(["b1"]);
      expect(stateB.submissions[0].status).toBe("accepted");
      expect((await master.account()).body.account.email).toBe("m@example.test");
    });

    it("refuses a Master who opens another Master's relationship by ID, revealing nothing", async () => {
      const { other, a } = await setup();
      const read = await other.open(a);
      expect(read.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(read.body)).not.toMatch(/Aria|Priya|Only for A/);
      const write = await other.call({
        op: "command",
        spaceId: a,
        revision: 1,
        command: { type: "routine.save", routine },
      });
      expect(write.status).toBeGreaterThanOrEqual(400);
    });

    it("refuses a Sub who edits the URL to another Sub's relationship", async () => {
      const { subA, b } = await setup();
      const read = await subA.open(b);
      expect(read.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(read.body)).not.toMatch(/Bea/);
    });

    it("refuses Master-only actions sent directly by a Sub", async () => {
      const { subA, a } = await setup();
      expect((await subA.command(a, { type: "routine.save", routine })).status).toBe(400);
      expect(
        (
          await subA.command(a, {
            type: "points.award",
            entry: { id: "x", kind: "reward", amount: 10, reason: "Self" },
          })
        ).status,
      ).toBe(400);
    });

    it("pauses one relationship without touching the other", async () => {
      const { master, subA, a, b } = await setup();
      await subA.command(a, { type: "pause", reason: "Stop", signal: "RED" });
      expect(
        (await master.command(a, { type: "routine.save", routine: { ...routine, id: "z" } }))
          .status,
      ).toBe(400);
      expect(
        (await master.command(b, { type: "routine.save", routine: { ...routine, id: "z" } }))
          .status,
      ).toBe(200);
    });
  });
}
