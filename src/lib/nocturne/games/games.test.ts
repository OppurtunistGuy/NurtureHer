import { describe, expect, it } from "vitest";
import { dealable, drawCard, heatAtOrBelow, validateNewCard } from "./deck";
import { gamesEnabled } from "./flag";
import { cardRespectsLimits, hardLimitsFromState, limitTerms } from "./limits";
import { complete, createSession, deal, join, nextTurn, red, skip, stop, yellow } from "./session";
import { STARTER_DECK } from "./starter-deck";
import { CATEGORIES, type DealContext, type GameCard } from "./types";

const HARD = ["Anal play", "tasting or ingesting semen", "panties-in-mouth nasty activities"];
const ctx = (over: Partial<DealContext> = {}): DealContext => ({
  heat: "spicy",
  hardLimits: HARD,
  hidden: [],
  notForMe: [],
  ...over,
});
const active = () => {
  const a = join(createSession("g1", "dice", "spicy"), "dom");
  if (!a.ok) throw new Error("join");
  const b = join(a.value, "sub");
  if (!b.ok) throw new Error("join");
  return b.value;
};

describe("starter deck", () => {
  it("has one card per category and heat level", () => {
    for (const category of CATEGORIES) {
      for (const heat of ["sweet", "spicy", "hot"] as const) {
        expect(STARTER_DECK.filter((c) => c.category === category && c.heat === heat)).toHaveLength(
          1,
        );
      }
    }
    expect(new Set(STARTER_DECK.map((c) => c.id)).size).toBe(STARTER_DECK.length);
  });
  it("never trips the couple's written hard limits", () => {
    expect(STARTER_DECK.every((card) => cardRespectsLimits(card, HARD))).toBe(true);
  });
});

describe("heat levels", () => {
  it("deals only cards at or below the chosen level", () => {
    expect(heatAtOrBelow("sweet", "spicy")).toBe(true);
    expect(heatAtOrBelow("hot", "spicy")).toBe(false);
    const pool = dealable(STARTER_DECK, ctx({ heat: "sweet" }));
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((c) => c.heat === "sweet")).toBe(true);
    expect(dealable(STARTER_DECK, ctx({ heat: "hot" }))).toHaveLength(STARTER_DECK.length);
  });
});

describe("limits filter", () => {
  const bad = (title: string, tags: string[] = []): GameCard => ({
    id: title,
    title,
    category: "teasing",
    heat: "sweet",
    kind: "task",
    limitTags: tags,
  });
  it("splits a written limit into phrases and key words", () => {
    const terms = limitTerms(HARD);
    expect(terms).toContain("anal play");
    expect(terms).toContain("anal");
    expect(terms).toContain("semen");
    expect(terms).not.toContain("play");
  });
  it("blocks a card whose title or tag matches a limit", () => {
    expect(cardRespectsLimits(bad("Some anal play"), HARD)).toBe(false);
    expect(cardRespectsLimits(bad("Something kind", ["semen"]), HARD)).toBe(false);
    expect(cardRespectsLimits(bad("A game of cards"), HARD)).toBe(true);
    expect(cardRespectsLimits(bad("Anything"), [])).toBe(true);
  });
  it("removes blocked cards from the deck and refuses to add new ones", () => {
    const deck = [...STARTER_DECK, bad("Bad card", ["anal"])];
    expect(dealable(deck, ctx({ heat: "hot" })).find((c) => c.id === "Bad card")).toBeUndefined();
    expect(validateNewCard(bad("Bad card", ["anal"]), HARD)).toMatch(/hard limits/);
    expect(validateNewCard(bad("Fine card"), HARD)).toBeNull();
    expect(validateNewCard(bad("  "), HARD)).toMatch(/title/);
  });
  it("reads the hard limits from the saved agreement", () => {
    const limits = hardLimitsFromState({
      agreement: {
        excluded: ["Public play"],
        document: {
          version: "1",
          markdown: "- **Hard limits:** Anal play, tasting or ingesting semen.",
        },
      },
    } as never);
    expect(limits).toContain("Public play");
    expect(limits.some((l) => l.startsWith("Anal play"))).toBe(true);
  });
});

describe("hiding and refusing cards", () => {
  it("skips cards the Master hid or the Sub marked not for me", () => {
    const pool = dealable(STARTER_DECK, ctx({ hidden: ["svc-sweet"], notForMe: ["svc-spicy"] }));
    expect(pool.find((c) => c.id === "svc-sweet")).toBeUndefined();
    expect(pool.find((c) => c.id === "svc-spicy")).toBeUndefined();
  });
  it("keeps punishments and deductions out of normal deals", () => {
    const deck: GameCard[] = [
      ...STARTER_DECK,
      {
        id: "p",
        title: "Punish",
        category: "obedience",
        heat: "sweet",
        kind: "punishment",
        limitTags: [],
      },
    ];
    expect(dealable(deck, ctx({ heat: "hot" })).find((c) => c.id === "p")).toBeUndefined();
    expect(dealable(deck, ctx({ heat: "hot", kinds: ["punishment"] })).map((c) => c.id)).toEqual([
      "p",
    ]);
  });
  it("does not repeat a card until the pool is used, then starts over", () => {
    const small = STARTER_DECK.filter((c) => c.heat === "sweet");
    let seen: string[] = [];
    const ids: string[] = [];
    for (let i = 0; i < small.length; i++) {
      const draw = drawCard(small, ctx({ heat: "sweet" }), seen, () => 0)!;
      ids.push(draw.card.id);
      seen = draw.seen;
    }
    expect(new Set(ids).size).toBe(small.length);
    expect(drawCard(small, ctx({ heat: "sweet" }), seen, () => 0)!.seen).toHaveLength(1);
    expect(drawCard([], ctx(), [], () => 0)).toBeNull();
  });
});

describe("game session", () => {
  it("starts only after both people join", () => {
    const first = join(createSession("g", "dice", "sweet"), "dom");
    expect(first.ok && first.value.status).toBe("lobby");
    const dealt = first.ok ? deal(first.value, STARTER_DECK, ctx()) : null;
    expect(dealt?.ok).toBe(false);
    expect(active().status).toBe("active");
    expect(active().turn).toBe("dom");
  });
  it("deals a card at the game's heat level and blocks a second until it is finished", () => {
    const dealt = deal(active(), STARTER_DECK, ctx({ heat: "hot" }), () => 0);
    expect(dealt.ok).toBe(true);
    if (!dealt.ok) return;
    expect(dealt.value.currentCard).not.toBeNull();
    expect(dealt.value.currentCard!.heat).not.toBe("hot");
    expect(deal(dealt.value, STARTER_DECK, ctx())).toMatchObject({ ok: false });
    const done = complete(dealt.value);
    expect(done.ok && done.value.currentCard).toBeNull();
  });
  it("gives each person two free skips, never more", () => {
    let s = active();
    for (let i = 0; i < 2; i++) {
      const d = deal(s, STARTER_DECK, ctx(), () => 0);
      if (!d.ok) throw new Error(d.error);
      const k = skip(d.value, "sub");
      if (!k.ok) throw new Error(k.error);
      s = k.value;
    }
    expect(s.skips).toEqual({ dom: 2, sub: 0 });
    const d = deal(s, STARTER_DECK, ctx(), () => 0);
    if (!d.ok) throw new Error(d.error);
    expect(skip(d.value, "sub")).toMatchObject({ ok: false, error: "No free skips left." });
    expect(skip(d.value, "dom").ok).toBe(true);
  });
  it("YELLOW skips the card without using a free skip", () => {
    const d = deal(active(), STARTER_DECK, ctx(), () => 0);
    if (!d.ok) throw new Error(d.error);
    const y = yellow(d.value);
    expect(y.ok && y.value.currentCard).toBeNull();
    expect(y.ok && y.value.skips).toEqual({ dom: 2, sub: 2 });
  });
  it("RED and Stop end the game at once, for either person", () => {
    const d = deal(active(), STARTER_DECK, ctx(), () => 0);
    if (!d.ok) throw new Error(d.error);
    const r = red(d.value, "sub");
    expect(r).toMatchObject({
      status: "stopped",
      stopReason: "red",
      stoppedBy: "sub",
      currentCard: null,
    });
    expect(stop(active(), "dom")).toMatchObject({ status: "stopped", stopReason: "stop" });
    expect(deal(r, STARTER_DECK, ctx())).toMatchObject({ ok: false });
    expect(join(r, "dom")).toMatchObject({ ok: false });
    expect(stop(r, "dom")).toBe(r);
  });
  it("passes the turn to the other person", () => {
    const n = nextTurn(active());
    expect(n.ok && n.value.turn).toBe("sub");
  });
});

describe("feature flag", () => {
  it("is off unless GAMES_ENABLED is exactly 1", () => {
    expect(gamesEnabled({})).toBe(false);
    expect(gamesEnabled({ GAMES_ENABLED: "0" })).toBe(false);
    expect(gamesEnabled({ GAMES_ENABLED: "true" })).toBe(false);
    expect(gamesEnabled({ GAMES_ENABLED: "1" })).toBe(true);
  });
});
