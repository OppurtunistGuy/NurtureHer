import { describe, expect, it } from "vitest";
import { createSession, join } from "./session";
import { STARTER_DECK } from "./starter-deck";
import { WHEEL_SLICES } from "./types";
import { pickCategory, spinWheel } from "./wheel";

const ctx = { hardLimits: [], hidden: [], notForMe: [] };
function active(masterOnly = false) {
  let s = createSession("w1", "wheel", "hot", masterOnly);
  for (const r of ["dom", "sub"] as const) {
    const j = join(s, r);
    if (!j.ok) throw new Error(j.error);
    s = j.value;
  }
  return s;
}
// A random value that lands in the middle of a given slice.
const at = (slice: number) => (slice + 0.5) / WHEEL_SLICES.length;

describe("Wheel of Fortune", () => {
  it("lands on a category slice and deals a card from it", () => {
    const r = spinWheel(active(), "dom", STARTER_DECK, ctx, () => at(0));
    expect(r.ok && r.value.lastSpin?.slice).toBe(0);
    expect(r.ok && r.value.currentCard?.category).toBe("service");
  });

  it("Spin again deals no card and keeps the turn", () => {
    const again = WHEEL_SLICES.indexOf("again");
    const r = spinWheel(active(), "dom", STARTER_DECK, ctx, () => at(again));
    expect(r.ok && r.value.currentCard).toBeNull();
    expect(r.ok && r.value.turn).toBe("dom");
  });

  it("Your choice waits for a category, only the spinner may pick, and it deals from it", () => {
    const choice = WHEEL_SLICES.indexOf("choice");
    const s = spinWheel(active(), "dom", STARTER_DECK, ctx, () => at(choice));
    if (!s.ok) throw new Error(s.error);
    expect(s.value.choosing).toBe(true);
    expect(spinWheel(s.value, "dom", STARTER_DECK, ctx, () => 0).ok).toBe(false);
    expect(pickCategory(s.value, "sub", "teasing", STARTER_DECK, ctx, () => 0).ok).toBe(false);
    const p = pickCategory(s.value, "dom", "teasing", STARTER_DECK, ctx, () => 0);
    expect(p.ok && p.value.currentCard?.category).toBe("teasing");
    expect(p.ok && p.value.choosing).toBe(false);
  });

  it("respects turn, the Master-only lock and a card already on the table", () => {
    expect(spinWheel(active(), "sub", STARTER_DECK, ctx, () => 0).ok).toBe(false);
    expect(spinWheel(active(true), "sub", STARTER_DECK, ctx, () => 0).ok).toBe(false);
    const first = spinWheel(active(), "dom", STARTER_DECK, ctx, () => 0);
    if (!first.ok) throw new Error(first.error);
    expect(spinWheel(first.value, "dom", STARTER_DECK, ctx, () => 0).ok).toBe(false);
  });

  it("never deals a card that crosses a hard limit or a punishment", () => {
    const limits = { ...ctx, hardLimits: ["massage", "kissing"] };
    for (let i = 0; i < WHEEL_SLICES.length; i++) {
      const r = spinWheel(active(), "dom", STARTER_DECK, limits, () => at(i));
      if (r.ok && r.value.currentCard) {
        expect(r.value.currentCard.limitTags).not.toContain("massage");
        expect(r.value.currentCard.limitTags).not.toContain("kissing");
        expect(["task", "reward"]).toContain(r.value.currentCard.kind);
      }
    }
  });

  it("refuses on a dice game", () => {
    const dice = createSession("d", "dice", "hot");
    expect(spinWheel(dice, "dom", STARTER_DECK, ctx).ok).toBe(false);
  });
});
