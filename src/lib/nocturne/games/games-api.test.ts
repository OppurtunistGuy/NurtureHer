// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleSpaceRequest } from "../space-api.server";
import { SpaceRepository } from "../space-repository.server";
import type { SpaceSnapshot } from "../space-protocol";
import type { Role } from "../types";

let directory: string, db: SpaceRepository;
const clock = new Date("2026-10-26T12:00:00Z");
let accounts = 0;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "games-test-"));
  db = new SpaceRepository(join(directory, "spaces.sqlite"), () => clock);
});
afterEach(() => {
  delete process.env["GAMES_ENABLED"];
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

class Session {
  jar = new Map<string, string>();
  snapshot!: SpaceSnapshot;
  async request(body?: Record<string, unknown>) {
    const id = this.snapshot?.state.space.id;
    if (
      body &&
      (body["op"] === "create" || body["op"] === "join") &&
      !this.jar.has("boundsome_auth")
    )
      await this.request({
        op: "auth.register",
        name: "Person",
        email: `p${++accounts}@example.test`,
        password: "correct horse battery",
        adult: true,
      });
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const response = await handleSpaceRequest(
      new Request(`https://games.test/api/space${!body && id ? `?space=${id}` : ""}`, {
        method: body ? "POST" : "GET",
        headers: { origin: "https://games.test", "content-type": "application/json", cookie },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      db,
    );
    const value = await response.json();
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(";");
      const [key, ...rest] = pair!.split("=");
      if (attributes.some((a) => a.trim() === "Max-Age=0")) this.jar.delete(key!);
      else this.jar.set(key!, rest.join("="));
    }
    if (value.state) this.snapshot = value as SpaceSnapshot;
    if (value.snapshot) this.snapshot = value.snapshot as SpaceSnapshot;
    return { response, value };
  }
  command(command: Record<string, unknown>) {
    return this.request({
      op: "command",
      revision: this.snapshot.revision,
      spaceId: this.snapshot.state.space.id,
      command,
    });
  }
}
async function readyPair(creatorRole: Role = "dom") {
  const creator = new Session(),
    partner = new Session();
  await creator.request({ op: "create", name: "Maya", role: creatorRole, adult: true });
  await partner.request({
    op: "join",
    token: creator.snapshot.invite!.token,
    name: "Aria",
    adult: true,
  });
  await creator.request();
  expect((await creator.command({ type: "agreement.ack" })).response.status).toBe(200);
  await partner.request();
  await partner.command({ type: "agreement.ack" });
  await creator.request();
  return { creator, partner };
}

describe("Games over the shared API", () => {
  it("is off by default: no feature flag in the snapshot and every game command is refused", async () => {
    const { creator } = await readyPair();
    expect(creator.snapshot.features?.games).toBe(false);
    const result = await creator.command({
      type: "game.start",
      game: "dice",
      heat: "sweet",
      masterOnlyRoll: false,
    });
    expect(result.response.status).toBe(404);
    expect(creator.snapshot.state.games).toBeUndefined();
  });

  it("plays a full dice round between two independent sessions and persists it", async () => {
    process.env["GAMES_ENABLED"] = "1";
    const { creator, partner } = await readyPair();
    await creator.request();
    expect(creator.snapshot.features?.games).toBe(true);

    const started = await creator.command({
      type: "game.start",
      game: "dice",
      heat: "spicy",
      masterOnlyRoll: false,
    });
    expect(started.response.status).toBe(200);
    await partner.request();
    expect(partner.snapshot.state.games?.session?.status).toBe("lobby");
    expect((await partner.command({ type: "game.join" })).response.status).toBe(200);
    await creator.request();
    expect(creator.snapshot.state.games?.session?.status).toBe("active");

    // The Sub can't roll on the Master's turn.
    expect((await partner.command({ type: "game.roll" })).response.status).toBe(400);
    const rolled = await creator.command({ type: "game.roll" });
    expect(rolled.response.status).toBe(200);
    await partner.request();
    const card = partner.snapshot.state.games!.session!.currentCard!;
    expect(card.heat).not.toBe("hot");
    expect(partner.snapshot.state.games!.session!.lastRoll).toBeDefined();

    // Card text never reaches the shared activity log.
    expect(JSON.stringify(partner.snapshot.state.activity)).not.toContain(card.title);

    expect((await partner.command({ type: "game.done" })).response.status).toBe(200);
    await creator.request();
    expect(creator.snapshot.state.games!.session).toMatchObject({
      currentCard: null,
      turn: "sub",
    });

    // The game survives a restart of the repository.
    const path = join(directory, "spaces.sqlite");
    db.close();
    db = new SpaceRepository(path, () => clock);
    const again = await creator.request();
    expect(again.value.state.games.session.turn).toBe("sub");
  });

  it("refuses forged roles, unknown fields and bad values", async () => {
    process.env["GAMES_ENABLED"] = "1";
    const { creator, partner } = await readyPair();
    const start = { type: "game.start", game: "dice", heat: "hot", masterOnlyRoll: false };
    expect((await creator.command({ ...start, heat: "extreme" })).response.status).toBe(400);
    expect((await creator.command({ ...start, role: "sub" })).response.status).toBe(400);
    expect((await creator.command({ type: "game.roll", extra: 1 })).response.status).toBe(400);
    expect((await partner.command({ ...start, masterOnlyRoll: true })).response.status).toBe(400);
    expect(
      (await partner.command({ type: "game.hide", cardId: "svc-sweet" })).response.status,
    ).toBe(400);
    expect(
      (await creator.command({ type: "game.refuse", cardId: "svc-sweet" })).response.status,
    ).toBe(400);
  });

  it("RED ends the game for both people at once", async () => {
    process.env["GAMES_ENABLED"] = "1";
    const { creator, partner } = await readyPair();
    await creator.command({
      type: "game.start",
      game: "dice",
      heat: "sweet",
      masterOnlyRoll: false,
    });
    await partner.request();
    await partner.command({ type: "game.join" });
    await creator.command({ type: "game.roll" });
    await partner.request();
    expect((await partner.command({ type: "game.red" })).response.status).toBe(200);
    await creator.request();
    expect(creator.snapshot.state.games!.session).toMatchObject({
      status: "stopped",
      stopReason: "red",
      currentCard: null,
    });
    expect((await creator.command({ type: "game.roll" })).response.status).toBe(400);
  });

  it("plays the wheel through the API, including Your choice", async () => {
    process.env["GAMES_ENABLED"] = "1";
    const { creator, partner } = await readyPair();
    expect(
      (
        await creator.command({
          type: "game.start",
          game: "wheel",
          heat: "hot",
          masterOnlyRoll: false,
        })
      ).response.status,
    ).toBe(200);
    await partner.request();
    await partner.command({ type: "game.join" });
    await creator.request();
    // Dice commands don't work on a wheel game.
    expect((await creator.command({ type: "game.roll" })).response.status).toBe(400);
    expect((await partner.command({ type: "game.spin" })).response.status).toBe(400);
    expect((await creator.command({ type: "game.pick", category: "bogus" })).response.status).toBe(
      400,
    );
    // Spin until something other than "Spin again"/"Your choice" is dealt, or pick when asked.
    for (let i = 0; i < 12; i++) {
      expect((await creator.command({ type: "game.spin" })).response.status).toBe(200);
      const game = creator.snapshot.state.games!.session!;
      if (game.choosing) {
        expect(
          (await creator.command({ type: "game.pick", category: "affection" })).response.status,
        ).toBe(200);
      }
      if (creator.snapshot.state.games!.session!.currentCard) break;
    }
    const card = creator.snapshot.state.games!.session!.currentCard;
    expect(card).not.toBeNull();
    expect(creator.snapshot.state.games!.session!.lastSpin).toBeDefined();
    expect((await creator.command({ type: "game.done" })).response.status).toBe(200);
    await partner.request();
    expect(partner.snapshot.state.games!.session!.turn).toBe("sub");
  });
});
