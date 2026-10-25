import { describe, expect, it } from "vitest";
import { transition, type Command, type Context } from "../engine";
import { createInitialState } from "../store";
import { savedStateSchema } from "../storage";
import type { AppState, Role } from "../types";

const now = new Date(2026, 9, 26, 10, 0);
let sequence = 0;
const ctx = (random = 0): Context => ({
  now,
  id: () => `g-${++sequence}`,
  random: () => random,
});
function paired(): AppState {
  const s = createInitialState();
  return {
    ...s,
    onboarded: true,
    space: { ...s.space, paired: true },
    agreement: { ...s.agreement, ack: { dom: now.toISOString(), sub: now.toISOString() } },
  };
}
const as = (s: AppState, role: Role): AppState => ({ ...s, viewRole: role, myRole: role });
const run = (s: AppState, role: Role, cmd: Command, random = 0) =>
  transition(as(s, role), cmd, ctx(random));
function started(random = 0): AppState {
  let s = run(paired(), "dom", {
    type: "game.start",
    game: "dice",
    heat: "hot",
    masterOnlyRoll: false,
  });
  s = run(s, "sub", { type: "game.join" }, random);
  return s;
}

describe("games in the engine", () => {
  it("needs both people in the space and the agreement acknowledged", () => {
    const start: Command = {
      type: "game.start",
      game: "dice",
      heat: "sweet",
      masterOnlyRoll: false,
    };
    const lone = { ...paired(), space: { ...paired().space, paired: false } };
    expect(() => run(lone, "dom", start)).toThrow(/both people/i);
    const unsigned = {
      ...paired(),
      agreement: { ...paired().agreement, ack: { dom: null, sub: null } },
    };
    expect(() => run(unsigned, "dom", start)).toThrow(/acknowledge the agreement/i);
  });
  it("starts, joins, rolls and finishes a card, passing the turn", () => {
    let s = started();
    expect(s.games!.session).toMatchObject({ status: "active", turn: "dom" });
    s = run(s, "dom", { type: "game.roll" });
    expect(s.games!.session!.currentCard).not.toBeNull();
    expect(() => run(s, "sub", { type: "game.roll" })).toThrow();
    s = run(s, "sub", { type: "game.done" });
    expect(s.games!.session).toMatchObject({ currentCard: null, turn: "sub" });
  });
  it("the Sub can't take the Master's roll, and only the card's owner can skip", () => {
    let s = started();
    expect(() => run(s, "sub", { type: "game.roll" })).toThrow(/your turn/i);
    s = run(s, "dom", { type: "game.roll" });
    expect(() => run(s, "sub", { type: "game.skip" })).toThrow(/whose card/i);
    s = run(s, "dom", { type: "game.skip" });
    expect(s.games!.session!.skips).toEqual({ dom: 1, sub: 2 });
  });
  it("only the Master can lock the dice", () => {
    expect(() =>
      run(paired(), "sub", {
        type: "game.start",
        game: "dice",
        heat: "sweet",
        masterOnlyRoll: true,
      }),
    ).toThrow(/only the Master/i);
  });
  it("refuses a second game while one is running", () => {
    expect(() =>
      run(started(), "dom", {
        type: "game.start",
        game: "dice",
        heat: "sweet",
        masterOnlyRoll: false,
      }),
    ).toThrow(/already running/i);
  });
  it("keeps card text out of the shared activity log", () => {
    const s = run(started(), "dom", { type: "game.roll" });
    const card = s.games!.session!.currentCard!;
    expect(JSON.stringify(s.activity)).not.toContain(card.title);
  });
  it("hide is Master-only and not-for-me is Sub-only", () => {
    const s = started();
    expect(() => run(s, "sub", { type: "game.hide", cardId: "svc-sweet" })).toThrow(
      /only the master/i,
    );
    expect(() => run(s, "dom", { type: "game.refuse", cardId: "svc-sweet" })).toThrow(/partner/i);
    expect(run(s, "dom", { type: "game.hide", cardId: "svc-sweet" }).games!.hidden).toEqual([
      "svc-sweet",
    ]);
    expect(run(s, "sub", { type: "game.refuse", cardId: "svc-sweet" }).games!.notForMe).toEqual([
      "svc-sweet",
    ]);
  });
  it("never deals a card that crosses the agreement's hard limits", () => {
    const base = started();
    const limited = {
      ...base,
      agreement: { ...base.agreement, excluded: ["massage", "serving", "Pick the movie"] },
    };
    for (let i = 0; i < 40; i++) {
      let s = run(limited, "dom", { type: "game.roll" }, Math.floor((i / 40) * 4294967296));
      const title = s.games!.session!.currentCard!.title.toLowerCase();
      expect(title).not.toMatch(/massage|serving|movie/);
      s = run(s, "sub", { type: "game.done" });
    }
  });
  it("RED and Stop still work while the space is paused, but nothing else does", () => {
    let s = run(started(), "dom", { type: "game.roll" });
    s = run(s, "sub", { type: "pause", reason: "", signal: "YELLOW" });
    expect(() => run(s, "dom", { type: "game.done" })).toThrow(/paused/i);
    expect(() => run(s, "dom", { type: "game.roll" })).toThrow(/paused/i);
    expect(run(s, "sub", { type: "game.red" }).games!.session).toMatchObject({
      status: "stopped",
      stopReason: "red",
      stoppedBy: "sub",
    });
    expect(run(s, "dom", { type: "game.stop" }).games!.session!.status).toBe("stopped");
  });
  it("saves and reloads game state, and old spaces without games still load", () => {
    const s = run(started(), "dom", { type: "game.roll" });
    const saved = savedStateSchema.parse(JSON.parse(JSON.stringify(s)));
    expect(saved.games?.session?.currentCard?.id).toBe(s.games!.session!.currentCard!.id);
    const { games: _games, ...old } = JSON.parse(JSON.stringify(paired()));
    expect(savedStateSchema.parse(old).games).toBeUndefined();
  });
});

describe("Snakes & Ladders in the engine", () => {
  const u32 = (die: number) => Math.floor(((die - 0.5) / 6) * 4294967296);
  function snakesGame(boxDom: boolean, boxSub: boolean): AppState {
    let s = run(paired(), "dom", {
      type: "game.start",
      game: "snakes",
      heat: "hot",
      masterOnlyRoll: false,
      box: boxDom,
    });
    s = run(s, "sub", { type: "game.join", box: boxSub });
    return s;
  }
  const nudge = (s: AppState, dom: number): AppState => ({
    ...s,
    games: { ...s.games!, session: { ...s.games!.session!, positions: { dom, sub: 0 } } },
  });

  it("starts on square 0 with separate game scores and survives a save and reload", () => {
    const s = snakesGame(true, true);
    expect(s.games!.session).toMatchObject({
      game: "snakes",
      status: "active",
      positions: { dom: 0, sub: 0 },
      score: { dom: 0, sub: 0 },
      box: { dom: true, sub: true },
    });
    const reloaded = savedStateSchema.parse(JSON.parse(JSON.stringify(s)));
    expect(reloaded.games?.session?.positions).toEqual({ dom: 0, sub: 0 });
    expect(reloaded.games?.session?.box).toEqual({ dom: true, sub: true });
  });

  it("a Master snake bite gives the Sub points, then only the Sub can open the box", () => {
    let s = nudge(snakesGame(true, true), 14);
    s = run(s, "dom", { type: "game.move" }, u32(3));
    expect(s.games!.session).toMatchObject({
      boxPending: true,
      positions: { dom: 7 },
      score: { sub: 5 },
    });
    expect(() => run(s, "dom", { type: "game.box" })).toThrow(/partner/i);
    expect(() => run(s, "dom", { type: "game.move" })).toThrow();
    const opened = run(s, "sub", { type: "game.box" }, u32(4));
    expect(opened.games!.session!.boxPending).toBe(false);
    expect(opened.games!.session!.lastBox).toBeDefined();
    // Box text stays out of the shared activity log.
    const title = opened.games!.session!.lastBox!.title;
    expect(JSON.stringify(opened.activity)).not.toContain(title);
  });

  it("the Sub can veto a box task with a free skip, even though it is the Master's turn", () => {
    let s = nudge(snakesGame(true, true), 14);
    s = run(s, "dom", { type: "game.move" }, u32(3));
    // random near 0.7 of u32 range -> punishment/task card, never a deduction
    let opened = run(s, "sub", { type: "game.box" }, Math.floor(0.7 * 4294967296));
    expect(opened.games!.session!.cardFor).toBe("sub");
    expect(() => run(opened, "dom", { type: "game.skip" })).toThrow();
    opened = run(opened, "sub", { type: "game.skip" });
    expect(opened.games!.session).toMatchObject({ currentCard: null, turn: "sub" });
    expect(opened.games!.session!.skips.sub).toBe(1);
  });

  it("there is no box unless both people said yes", () => {
    let s = nudge(snakesGame(true, false), 14);
    s = run(s, "dom", { type: "game.move" }, u32(3));
    expect(s.games!.session).toMatchObject({ boxPending: false, score: { sub: 5 }, turn: "sub" });
  });

  it("RED works at any point in Snakes & Ladders, even with a box waiting", () => {
    let s = nudge(snakesGame(true, true), 14);
    s = run(s, "dom", { type: "game.move" }, u32(3));
    s = run(s, "sub", { type: "game.red" });
    expect(s.games!.session).toMatchObject({ status: "stopped", stopReason: "red" });
  });

  it("a Master-only roll lock is refused for this game", () => {
    expect(() =>
      run(paired(), "dom", {
        type: "game.start",
        game: "snakes",
        heat: "hot",
        masterOnlyRoll: true,
      }),
    ).toThrow();
  });
});
