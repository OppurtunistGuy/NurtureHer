import { describe, expect, it } from "vitest";
import { BOARD_SIZE, CARD_SQUARES, LADDERS, SNAKES, squareCell } from "./board";
import { BOX_DECK } from "./box-deck";
import { createSession, join } from "./session";
import { awardCardPoints, boxActive, moveToken, openBox, setBoxConsent } from "./snakes";
import { STARTER_DECK } from "./starter-deck";
import type { GameSession } from "./types";

const ctx = { hardLimits: [] as string[], hidden: [], notForMe: [] };
const die = (n: number) => () => (n - 0.5) / 6;
function game(box = true): GameSession {
  let s = createSession("s1", "snakes", "hot");
  s = setBoxConsent(s, "dom", box);
  s = setBoxConsent(s, "sub", box);
  for (const r of ["dom", "sub"] as const) {
    const j = join(s, r);
    if (!j.ok) throw new Error(j.error);
    s = j.value;
  }
  return s;
}
const at = (s: GameSession, dom: number, sub = 0, turn: "dom" | "sub" = "dom"): GameSession => ({
  ...s,
  positions: { dom, sub },
  turn,
});
const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("the board", () => {
  it("has 100 squares laid out like a printed board", () => {
    expect(squareCell(1)).toEqual({ row: 9, col: 0 });
    expect(squareCell(10)).toEqual({ row: 9, col: 9 });
    expect(squareCell(11)).toEqual({ row: 8, col: 9 });
    expect(squareCell(100)).toEqual({ row: 0, col: 0 });
  });
  it("ladders go up, snakes go down, and nothing overlaps", () => {
    for (const [a, b] of Object.entries(LADDERS)) expect(b).toBeGreaterThan(Number(a));
    for (const [a, b] of Object.entries(SNAKES)) expect(b).toBeLessThan(Number(a));
    const ends = [...Object.keys(LADDERS), ...Object.keys(SNAKES)].map(Number);
    expect(new Set(ends).size).toBe(ends.length);
    for (const n of [...Object.values(LADDERS), ...Object.values(SNAKES)])
      expect(ends).not.toContain(n);
    expect(CARD_SQUARES.length).toBeGreaterThan(8);
    for (const n of CARD_SQUARES) expect(ends).not.toContain(n);
  });
});

describe("moving", () => {
  it("moves by the die and passes the turn on a plain square", () => {
    const s = must(moveToken(game(), "dom", STARTER_DECK, ctx, die(3)));
    expect(s.positions).toEqual({ dom: 3, sub: 0 });
    expect(s.turn).toBe("sub");
    expect(s.lastMove).toMatchObject({ event: "none", die: 3, from: 0, to: 3 });
  });
  it("only the person whose turn it is can roll", () => {
    expect(moveToken(game(), "sub", STARTER_DECK, ctx, die(1)).ok).toBe(false);
  });
  it("a ladder climbs and scores 2 game points", () => {
    const s = must(moveToken(at(game(), 1), "dom", STARTER_DECK, ctx, die(3))); // 1+3 = 4 -> 14
    expect(s.positions?.dom).toBe(14);
    expect(s.score?.dom).toBe(2);
    expect(s.lastMove).toMatchObject({ event: "ladder", via: 4 });
  });
  it("a card square deals a task card, for the person who landed", () => {
    const s = must(moveToken(at(game(), 7), "dom", STARTER_DECK, ctx, die(3))); // 10
    expect(s.lastMove?.event).toBe("card");
    expect(s.currentCard).not.toBeNull();
    expect(["task", "reward"]).toContain(s.currentCard!.kind);
    expect(s.cardFor).toBe("dom");
    expect(s.turn).toBe("dom");
  });
  it("blocks a roll while a card or the box is waiting", () => {
    const withCard = must(moveToken(at(game(), 7), "dom", STARTER_DECK, ctx, die(3)));
    expect(moveToken(withCard, "dom", STARTER_DECK, ctx, die(1)).ok).toBe(false);
    expect(moveToken({ ...game(), boxPending: true }, "dom", STARTER_DECK, ctx, die(1)).ok).toBe(
      false,
    );
  });
  it("reaching 100 ends the game with a winner", () => {
    const s = must(moveToken(at(game(), 97), "dom", STARTER_DECK, ctx, die(6)));
    expect(s).toMatchObject({ status: "stopped", stopReason: "finished", winner: "dom" });
  });
});

describe("snake bites and the Surprise Box", () => {
  it("the Master's bite slides down, gives the Sub 5 points and opens the box", () => {
    const s = must(moveToken(at(game(), 14), "dom", STARTER_DECK, ctx, die(3))); // 17 -> 7
    expect(s.positions?.dom).toBe(7);
    expect(s.score?.sub).toBe(5);
    expect(s.boxPending).toBe(true);
    expect(s.turn).toBe("dom");
  });
  it("the Sub's bite only slides down: no points, no box", () => {
    const s = must(moveToken(at(game(), 0, 14, "sub"), "sub", STARTER_DECK, ctx, die(3)));
    expect(s.positions?.sub).toBe(7);
    expect(s.score).toEqual({ dom: 0, sub: 0 });
    expect(s.boxPending).toBe(false);
    expect(s.turn).toBe("dom");
  });
  it("without both people's consent there is no box, but the Sub still gets the points", () => {
    const g = game(false);
    expect(boxActive(g)).toBe(false);
    const s = must(moveToken(at(g, 14), "dom", STARTER_DECK, ctx, die(3)));
    expect(s.score?.sub).toBe(5);
    expect(s.boxPending).toBe(false);
    expect(s.turn).toBe("sub");
    expect(openBox({ ...s, boxPending: true }, "sub", STARTER_DECK, ctx).ok).toBe(false);
  });
  it("only one person opting in is not enough", () => {
    let g = createSession("x", "snakes", "hot");
    g = setBoxConsent(g, "dom", true);
    expect(boxActive(g)).toBe(false);
    g = setBoxConsent(g, "sub", false);
    expect(boxActive(g)).toBe(false);
  });
  const pending = (): GameSession => ({ ...game(), boxPending: true });
  it("only the Sub opens it, and only when it is pending", () => {
    expect(openBox(pending(), "dom", STARTER_DECK, ctx).ok).toBe(false);
    expect(openBox(game(), "sub", STARTER_DECK, ctx).ok).toBe(false);
  });
  it("about 60% task, 25% punishment, 15% deduction", () => {
    const kind = (r: number) =>
      must(openBox({ ...pending(), score: { dom: 0, sub: 9 } }, "sub", STARTER_DECK, ctx, () => r))
        .lastBox?.kind;
    expect(kind(0.3)).toBe("task");
    expect(kind(0.7)).toBe("punishment");
    expect(kind(0.95)).toBe("deduction");
  });
  it("a task or punishment is for the Sub even though it is the Master's turn", () => {
    const s = must(openBox(pending(), "sub", STARTER_DECK, ctx, () => 0.7));
    expect(s.currentCard?.kind).toBe("punishment");
    expect(s.cardFor).toBe("sub");
    expect(s.turn).toBe("dom");
  });
  it("a deduction only touches the game score and never goes below zero", () => {
    const s = must(
      openBox({ ...pending(), score: { dom: 0, sub: 2 } }, "sub", STARTER_DECK, ctx, () => 0.95),
    );
    expect(s.lastBox?.kind).toBe("deduction");
    expect(s.score?.sub).toBe(0);
    expect(s.currentCard).toBeNull();
    expect(s.turn).toBe("sub");
  });
  it("punishments respect the hard limits and the Sub's 'not for me' list", () => {
    const limited = { ...ctx, hardLimits: ["silent", "thank"] };
    for (let i = 0; i < 30; i++) {
      const s = must(openBox(pending(), "sub", STARTER_DECK, limited, () => 0.7 + (i % 3) * 0.01));
      const c = s.currentCard;
      if (c?.kind === "punishment") expect(c.title.toLowerCase()).not.toMatch(/silent|thank/);
    }
    const hiddenAll = { ...ctx, notForMe: BOX_DECK.map((c) => c.id) };
    const s = must(openBox(pending(), "sub", STARTER_DECK, hiddenAll, () => 0.7));
    expect(s.currentCard?.kind).not.toBe("punishment");
  });
  it("normal squares never deal punishments", () => {
    for (let i = 0; i < 20; i++) {
      const s = must(moveToken(at(game(), 7), "dom", STARTER_DECK, ctx, die(3)));
      expect(["task", "reward"]).toContain(s.currentCard?.kind);
    }
  });
});

describe("reward cards in Snakes & Ladders", () => {
  it("add their points to the game score of the person the card is for", () => {
    const reward = STARTER_DECK.find((c) => c.id === "rew-spicy")!;
    const s = awardCardPoints({ ...game(), currentCard: reward, cardFor: "sub" });
    expect(s.score?.sub).toBe(5);
  });
  it("never apply outside Snakes & Ladders", () => {
    const reward = STARTER_DECK.find((c) => c.id === "rew-spicy")!;
    const dice = { ...createSession("d", "dice", "hot"), currentCard: reward };
    expect(awardCardPoints(dice)).toBe(dice);
  });
});

it("board size constant", () => expect(BOARD_SIZE).toBe(100));
