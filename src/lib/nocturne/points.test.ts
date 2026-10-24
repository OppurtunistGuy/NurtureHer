import { describe, expect, it } from "vitest";
import { transition, type Command } from "./engine";
import { createInitialState } from "./initial-state";
import { DEFAULT_LEVELS, pointsSummary } from "./points";
import { readStoredState } from "./storage";
import type { AppState } from "./types";

const stamp = "2026-10-24T10:00:00Z";
let sequence = 0;
const ctx = { now: new Date(stamp), id: () => `activity-${++sequence}`, random: () => 1 };
function fixture() {
  const state = createInitialState();
  state.onboarded = true;
  state.viewRole = "dom";
  state.agreement.ack = { dom: stamp, sub: stamp };
  return state;
}
const award = (id = "award", kind: "reward" | "punishment" = "reward", amount = 10): Command => ({
  type: "points.award",
  entry: { id, kind, amount, reason: "Reviewed together" },
});
const run = (state: AppState, command: Command) => transition(state, command, ctx);

describe("space points and milestones", () => {
  it("migrates legacy demo data without clearing acknowledgements or routines", () => {
    const state = fixture();
    delete state.points;
    const restored = readStoredState(JSON.stringify(state));
    expect(restored.points).toEqual({ ledger: [], levels: DEFAULT_LEVELS });
    expect(restored.agreement.ack).toEqual(state.agreement.ack);
    expect(restored.routines).toEqual(state.routines);
  });
  it("keeps rewards, punishment balances and levels independent", () => {
    let state = run(fixture(), award("reward", "reward", 60));
    state = run(state, award("concern", "punishment", 5));
    expect(pointsSummary(state)).toMatchObject({
      rewards: 60,
      outstanding: 5,
      totalPunishment: 5,
      level: { threshold: 50 },
      progress: 10,
    });
    state = run(state, {
      type: "points.adjust",
      id: "concern",
      action: "resolve",
      note: "Discussed and resolved",
    });
    expect(pointsSummary(state)).toMatchObject({ rewards: 60, outstanding: 0, totalPunishment: 5 });
    expect(state.points!.ledger.find((item) => item.id === "concern")?.resolution).toBe(
      "Discussed and resolved",
    );
  });
  it("reverses an entry with a visible audit reason, without deleting it", () => {
    let state = run(fixture(), award("reward", "reward", 60));
    state = run(state, {
      type: "points.adjust",
      id: "reward",
      action: "void",
      note: "Duplicate recognition",
    });
    expect(pointsSummary(state).rewards).toBe(0);
    expect(state.points!.ledger).toHaveLength(1);
    expect(state.points!.ledger[0]?.voidReason).toBe("Duplicate recognition");
    expect(() =>
      run(state, { type: "points.adjust", id: "reward", action: "void", note: "Again" }),
    ).toThrow("already reversed");
  });
  it("rejects replayed entry ids", () => {
    const state = run(fixture(), award());
    expect(() => run(state, award())).toThrow("already recorded");
  });
  it.each([0, -1, 101, 0.5, NaN])("rejects an invalid amount %s", (amount) => {
    expect(() => run(fixture(), award("award", "reward", amount))).toThrow();
  });
  for (const command of [
    award(),
    { type: "points.adjust", id: "x", action: "void", note: "Correction" },
    { type: "points.levels", levels: DEFAULT_LEVELS },
  ] as Command[]) {
    it(`blocks ${command.type} for the Sub, while paused, or before agreement acknowledgement`, () => {
      const state = fixture();
      state.viewRole = "sub";
      expect(() => run(state, command)).toThrow("Only the Master");
      state.viewRole = "dom";
      state.pause.active = true;
      expect(() => run(state, command)).toThrow("Paused");
      state.pause.active = false;
      state.agreement.ack.sub = null;
      expect(() => run(state, command)).toThrow("acknowledge");
    });
  }
  it("requires an accepted submission from this space and prevents double rewards", () => {
    const state = fixture();
    state.submissions = [
      { id: "accepted", status: "accepted" } as NonNullable<AppState["submissions"]>[number],
    ];
    const command: Command = {
      type: "points.award",
      entry: {
        id: "first",
        kind: "reward",
        amount: 10,
        reason: "Completed routine",
        submissionId: "accepted",
      },
    };
    const next = run(state, command);
    expect(() => run(next, { ...command, entry: { ...command.entry, id: "second" } })).toThrow(
      "already has a reward",
    );
    expect(() =>
      run(state, { ...command, entry: { ...command.entry, submissionId: "other-space" } }),
    ).toThrow("from this space");
    expect(() =>
      run(state, { ...command, entry: { ...command.entry, kind: "punishment" } }),
    ).toThrow("Only rewards");
  });
  it("does not allow a reward to be marked resolved", () => {
    const state = run(fixture(), award());
    expect(() =>
      run(state, { type: "points.adjust", id: "award", action: "resolve", note: "Invalid" }),
    ).toThrow("Only outstanding");
  });
  it("validates ordered milestones and reaches the highest configured level", () => {
    let state = fixture();
    expect(() =>
      run(state, { type: "points.levels", levels: [...DEFAULT_LEVELS].reverse() }),
    ).toThrow();
    state = run(state, {
      type: "points.levels",
      levels: [
        { threshold: 0, label: "Start", milestone: "Begin" },
        { threshold: 20, label: "Steady", milestone: "Celebrate together" },
      ],
    });
    state = run(state, award("twenty", "reward", 20));
    expect(pointsSummary(state)).toMatchObject({
      level: { label: "Steady" },
      progress: 100,
      next: undefined,
    });
  });
  it("does not add points for a safety pause or a task's state alone", () => {
    const state = run(fixture(), { type: "pause", reason: "Check in", signal: "RED" });
    expect(pointsSummary(state)).toMatchObject({ rewards: 0, outstanding: 0, ledger: [] });
  });
});
