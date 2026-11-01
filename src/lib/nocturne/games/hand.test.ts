import { describe, expect, it } from "vitest";
import { transition, type Command, type Context } from "../engine";
import { createInitialState } from "../store";
import { savedStateSchema } from "../storage";
import type { AppState, Role } from "../types";
import { gamesForViewer, matchedIds } from "./hand";
import { AFTERCARE_DECK, STARTER_DECK } from "./starter-deck";
import type { ListAnswer } from "./types";

const now = new Date(2026, 10, 2, 21, 0);
let n = 0;
const ctx = (random = 0): Context => ({ now, id: () => `h-${++n}`, random: () => random });
function paired(): AppState {
  const s = createInitialState();
  return {
    ...s,
    onboarded: true,
    space: { ...s.space, paired: true },
    agreement: {
      ...s.agreement,
      excluded: [],
      ack: { dom: now.toISOString(), sub: now.toISOString() },
    },
  };
}
const as = (s: AppState, role: Role): AppState => ({ ...s, viewRole: role, myRole: role });
const run = (s: AppState, role: Role, cmd: Command, random = 0) =>
  transition(as(s, role), cmd, ctx(random));

/** Both people say yes to every Sweet and Spicy card, and maybe to Hot. */
function withLists(s: AppState, override: Record<string, ListAnswer> = {}): AppState {
  const answers: Record<string, ListAnswer> = Object.fromEntries(
    STARTER_DECK.map((c) => [c.id, c.heat === "hot" ? "maybe" : "yes"]),
  );
  s = run(s, "dom", { type: "game.list", answers });
  return run(s, "sub", { type: "game.list", answers: { ...answers, ...override } });
}
function night(length = 5, handSize = 3, heat: "sweet" | "spicy" | "hot" = "sweet") {
  let s = withLists(paired());
  s = run(s, "dom", {
    type: "game.start",
    game: "hand",
    heat,
    masterOnlyRoll: false,
    length,
    handSize,
  });
  return run(s, "sub", { type: "game.join" });
}
const session = (s: AppState) => s.games!.session!;

describe("the deck", () => {
  it("has over 120 cards with unique ids, and six aftercare cards", () => {
    expect(STARTER_DECK.length).toBeGreaterThanOrEqual(120);
    expect(new Set(STARTER_DECK.map((c) => c.id)).size).toBe(STARTER_DECK.length);
    expect(AFTERCARE_DECK).toHaveLength(6);
    for (const c of AFTERCARE_DECK) expect(STARTER_DECK.map((d) => d.id)).not.toContain(c.id);
  });
});

describe("private lists", () => {
  it("only cards both said yes or maybe to are matched", () => {
    const lists = {
      dom: { a: "yes", b: "maybe", c: "yes", d: "no" } as Record<string, ListAnswer>,
      sub: { a: "maybe", b: "no", c: "yes", d: "yes" } as Record<string, ListAnswer>,
    };
    expect([...matchedIds(lists)].sort()).toEqual(["a", "c"]);
  });
  it("refuses card ids that aren't in the deck", () => {
    expect(() => run(paired(), "dom", { type: "game.list", answers: { nope: "yes" } })).toThrow();
  });
  it("each person only ever sees their own list", () => {
    const s = withLists(paired(), { "svc-sweet": "no" });
    const forDom = gamesForViewer(s, "dom").games!;
    expect(forDom.lists!.sub).toEqual({});
    expect(Object.keys(forDom.lists!.dom).length).toBe(STARTER_DECK.length);
    expect(forDom.matchedCount).toBe(STARTER_DECK.length - 1);
    expect(forDom.listCounts).toEqual({ dom: STARTER_DECK.length, sub: STARTER_DECK.length });
    expect(gamesForViewer(s, "sub").games!.lists!.dom).toEqual({});
  });
  it("a night needs at least 8 matched cards", () => {
    const start: Command = {
      type: "game.start",
      game: "hand",
      heat: "sweet",
      masterOnlyRoll: false,
      length: 5,
      handSize: 3,
    };
    expect(() => run(paired(), "dom", start)).toThrow(/at least 8/);
  });
});

describe("a night of Hand of Cards", () => {
  it("only the Master starts it, with a valid length and hand size", () => {
    const s = withLists(paired());
    const base = {
      type: "game.start",
      game: "hand",
      heat: "sweet",
      masterOnlyRoll: false,
    } as const;
    expect(() => run(s, "sub", { ...base, length: 5, handSize: 3 })).toThrow(/Master/);
    expect(() => run(s, "dom", { ...base, length: 4, handSize: 3 })).toThrow();
    expect(() => run(s, "dom", { ...base, length: 5, handSize: 4 })).toThrow();
  });

  it("deals the Master a hand at tonight's heat once both have joined", () => {
    const s = night(5, 5, "spicy");
    expect(session(s).status).toBe("active");
    expect(session(s).night!.hand).toHaveLength(5);
    for (const c of session(s).night!.hand) expect(["sweet", "spicy"]).toContain(c.heat);
    expect(session(s).night!.hand.filter((c) => c.heat === "spicy").length).toBe(5);
    expect(session(s).turn).toBe("dom");
  });

  it("the Sub never receives the Master's hand", () => {
    const s = night();
    const forSub = gamesForViewer(s, "sub").games!.session!.night!;
    expect(forSub.hand).toEqual([]);
    expect(forSub.handCount).toBe(3);
    expect(gamesForViewer(s, "dom").games!.session!.night!.hand).toHaveLength(3);
  });

  it("the Master plays a card; only the Master can", () => {
    const s = night();
    const id = session(s).night!.hand[0]!.id;
    expect(() => run(s, "sub", { type: "game.play", cardId: id })).toThrow();
    expect(() => run(s, "dom", { type: "game.play", cardId: "not-in-hand" })).toThrow();
    const played = run(s, "dom", { type: "game.play", cardId: id });
    expect(session(played)).toMatchObject({ cardFor: "sub", turn: "sub" });
    expect(session(played).currentCard!.id).toBe(id);
    expect(session(played).night!.hand).toHaveLength(2);
  });

  it("Counter swaps the card for another from his hand, once a night", () => {
    let s = night();
    const first = session(s).night!.hand[0]!;
    s = run(s, "dom", { type: "game.play", cardId: first.id });
    expect(() => run(s, "dom", { type: "game.counter" })).toThrow();
    s = run(s, "sub", { type: "game.counter" });
    expect(session(s).currentCard!.id).not.toBe(first.id);
    expect(session(s).night!.counter).toBe(0);
    expect(session(s).night!.hand).toHaveLength(1);
    expect(session(s).night!.played.at(-1)).toMatchObject({ outcome: "countered" });
    expect(() => run(s, "sub", { type: "game.counter" })).toThrow(/used up/);
  });

  it("Mercy is the Sub's free skip: two per night, and it leads to the check-in", () => {
    let s = night();
    s = run(s, "dom", { type: "game.play", cardId: session(s).night!.hand[0]!.id });
    expect(() => run(s, "dom", { type: "game.skip" })).toThrow();
    s = run(s, "sub", { type: "game.skip" });
    expect(session(s).skips.sub).toBe(1);
    expect(session(s).night!.phase).toBe("checkin");
    expect(session(s).night!.played.at(-1)!.outcome).toBe("mercy");
  });

  it("check-in: the gentlest answer wins, and answers stay hidden until both are in", () => {
    let s = night(5, 3, "spicy");
    s = run(s, "dom", { type: "game.play", cardId: session(s).night!.hand[0]!.id });
    s = run(s, "sub", { type: "game.done" });
    s = run(s, "dom", { type: "game.checkin", pace: "up" });
    const forSub = gamesForViewer(s, "sub").games!.session!.night!;
    expect(forSub.checkin.dom).toBeNull();
    expect(forSub.answered).toEqual({ dom: true, sub: false });
    s = run(s, "sub", { type: "game.checkin", pace: "down" });
    expect(session(s).heat).toBe("sweet");
    expect(session(s).night!).toMatchObject({ phase: "choose", round: 2 });
    expect(session(s).night!.hand).toHaveLength(3);
    for (const c of session(s).night!.hand) expect(c.heat).toBe("sweet");
  });

  it("both saying keep going warms it up one level", () => {
    let s = night(5, 3, "sweet");
    s = run(s, "dom", { type: "game.play", cardId: session(s).night!.hand[0]!.id });
    s = run(s, "sub", { type: "game.done" });
    s = run(s, "dom", { type: "game.checkin", pace: "up" });
    s = run(s, "sub", { type: "game.checkin", pace: "up" });
    expect(session(s).heat).toBe("spicy");
  });

  it("'That's enough' from either goes straight to aftercare, then the night ends", () => {
    let s = night();
    s = run(s, "dom", { type: "game.play", cardId: session(s).night!.hand[0]!.id });
    s = run(s, "sub", { type: "game.done" });
    s = run(s, "dom", { type: "game.checkin", pace: "up" });
    s = run(s, "sub", { type: "game.checkin", pace: "end" });
    expect(session(s).night!.phase).toBe("aftercare");
    expect(AFTERCARE_DECK.map((c) => c.id)).toContain(session(s).currentCard!.id);
    expect(() => run(s, "sub", { type: "game.yellow" })).toThrow();
    s = run(s, "sub", { type: "game.done" });
    expect(session(s)).toMatchObject({ status: "stopped", stopReason: "finished" });
    expect(session(s).night!.played).toHaveLength(1);
  });

  it("plays a full night to the end, with no card repeated", () => {
    let s = night(7, 3, "sweet");
    const titles: string[] = [];
    for (let round = 1; round <= 7; round++) {
      const id = session(s).night!.hand[0]!.id;
      s = run(s, "dom", { type: "game.play", cardId: id });
      titles.push(session(s).currentCard!.title);
      s = run(s, "sub", { type: "game.done" });
      if (round < 7) {
        s = run(s, "dom", { type: "game.checkin", pace: "stay" });
        s = run(s, "sub", { type: "game.checkin", pace: "up" });
      }
    }
    expect(new Set(titles).size).toBe(7);
    expect(session(s).night!.phase).toBe("aftercare");
    // Saved state still validates, so the night survives a reload.
    expect(savedStateSchema.parse(JSON.parse(JSON.stringify(s))).games?.session?.night?.round).toBe(
      7,
    );
  });

  it("RED ends the night at any point", () => {
    let s = night();
    s = run(s, "dom", { type: "game.play", cardId: session(s).night!.hand[0]!.id });
    s = run(s, "sub", { type: "game.red" });
    expect(session(s)).toMatchObject({ status: "stopped", stopReason: "red" });
  });

  it("never deals a card that crosses a hard limit, even if both said yes", () => {
    let s = withLists(paired());
    s = { ...s, agreement: { ...s.agreement, excluded: ["Kneeling", "Kissing"] } };
    s = run(s, "dom", {
      type: "game.start",
      game: "hand",
      heat: "hot",
      masterOnlyRoll: false,
      length: 10,
      handSize: 5,
    });
    s = run(s, "sub", { type: "game.join" });
    for (const c of session(s).night!.hand) {
      expect(c.limitTags).not.toContain("kneeling");
      expect(c.limitTags).not.toContain("kissing");
    }
  });
});
