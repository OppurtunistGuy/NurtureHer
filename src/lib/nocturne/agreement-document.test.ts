import { describe, expect, it } from "vitest";
import { AGREEMENT_MARKDOWN, AGREEMENT_VERSION, upgradeAgreement } from "./agreement-document";
import { createInitialState } from "./store";
import { readStoredState } from "./storage";
import { transition } from "./engine";

const now = new Date(2026, 9, 23, 12),
  stamp = now.toISOString();
function legacy() {
  const s = createInitialState();
  const {
    document: _document,
    history: _history,
    checkInSignal: _signal,
    ...agreement
  } = s.agreement;
  return {
    ...s,
    onboarded: true,
    agreement: {
      ...agreement,
      boundaries: ["My existing boundary"],
      excluded: ["My existing limit"],
      safeword: "Nightfall",
      ack: { dom: stamp, sub: stamp },
    },
  };
}
describe("supplied Master & Sub Agreement", () => {
  it.each([false, true])(
    "preserves agreed terms and acknowledgements during rebranding (paused=%s)",
    (paused) => {
      const state = createInitialState();
      state.agreement.document!.markdown = AGREEMENT_MARKDOWN.replace(
        /^# BoundSome/,
        "# NOCTURNE TOGETHER",
      );
      state.agreement.ack = { dom: stamp, sub: stamp };
      state.pause.active = paused;
      const next = upgradeAgreement(state, now);
      expect(next.agreement.document?.markdown).toBe(AGREEMENT_MARKDOWN);
      expect(next.agreement.ack).toEqual(state.agreement.ack);
      expect(next.agreement.history).toEqual(state.agreement.history);
      expect(next.pause).toEqual(state.pause);
      expect(next.activity).toEqual(state.activity);
      expect(next.routines).toEqual(state.routines);
    },
  );
  it("installs the full text, exact hard limits, safety signals and pending acknowledgements", () => {
    const s = createInitialState();
    expect(s.agreement.document).toEqual({
      version: AGREEMENT_VERSION,
      markdown: AGREEMENT_MARKDOWN,
    });
    expect(AGREEMENT_MARKDOWN.match(/^### [1-7]\. /gm)).toHaveLength(7);
    expect(AGREEMENT_MARKDOWN).toContain("**The Master’s discretion**");
    expect(AGREEMENT_MARKDOWN).toContain(
      "Until December 16, the dynamic will focus on agreed BDSM sessions due to exams and family commitments.",
    );
    expect(AGREEMENT_MARKDOWN).toContain(
      "This agreement is a shared understanding of the dynamic, not a waiver of either person's right to stop or withdraw consent.",
    );
    expect(s.agreement.excluded).toEqual([
      "Anal play",
      "Tasting or ingesting semen",
      "Panties-in-mouth nasty activities",
    ]);
    expect(s.agreement.safeword).toBe("RED");
    expect(s.agreement.checkInSignal).toBe("YELLOW");
    expect(s.agreement.ack).toEqual({ dom: null, sub: null });
  });
  it("migrates existing data once and archives the previous terms and acknowledgements", () => {
    const old = legacy();
    old.messages = [{ id: "note", by: "sub", at: stamp, text: "Keep this note" }];
    const next = readStoredState(JSON.stringify(old));
    expect(next.routines).toEqual(old.routines);
    expect(next.messages).toEqual(old.messages);
    expect(next.agreement.history).toHaveLength(1);
    expect(next.agreement.history![0]!.boundaries).toEqual(["My existing boundary"]);
    expect(next.agreement.history![0]!.ack).toEqual({ dom: stamp, sub: stamp });
    expect(next.agreement.ack).toEqual({ dom: null, sub: null });
    next.agreement.ack = { dom: stamp, sub: stamp };
    const reload = readStoredState(JSON.stringify(next));
    expect(reload.agreement.history).toHaveLength(1);
    expect(reload.agreement.ack).toEqual({ dom: stamp, sub: stamp });
  });
  it("defers installation during a pause and installs only after mutual resume", () => {
    const old = legacy();
    old.pause = { active: true, sessionId: "pause", resumeAck: { dom: false, sub: false } };
    const waiting = upgradeAgreement(old, now);
    expect(waiting.agreement).toBe(old.agreement);
    expect(waiting.agreementUpdatePending).toBe(true);
    waiting.messages = ["dom", "sub"].map((by, i) => ({
      id: `${i}`,
      by: by as "dom" | "sub",
      text: "We discussed",
      at: stamp,
      channel: "discussion",
      pauseSession: "pause",
    }));
    let i = 0;
    const ctx = { now, id: () => `${++i}`, random: () => 1 };
    let s = transition(waiting, { type: "resume" }, ctx);
    expect(upgradeAgreement(s, now).agreement.document).toBeUndefined();
    s = transition(s, { type: "view", role: "sub" }, ctx);
    s = transition(s, { type: "resume" }, ctx);
    s = upgradeAgreement(s, now);
    expect(s.pause.active).toBe(false);
    expect(s.agreement.document?.version).toBe(AGREEMENT_VERSION);
    expect(s.agreement.ack).toEqual({ dom: null, sub: null });
  });
  for (const signal of ["RED", "YELLOW"] as const)
    it(`${signal} immediately locks actions for either role`, () => {
      for (const role of ["dom", "sub"] as const) {
        const s = createInitialState();
        s.onboarded = true;
        s.viewRole = role;
        const ctx = { now, id: () => "pause", random: () => 1 };
        const locked = transition(s, { type: "pause", reason: "", signal }, ctx);
        expect(locked.pause.active).toBe(true);
        expect(locked.pause.signal).toBe(signal);
        expect(() =>
          transition(locked, { type: "routine.save", routine: s.routines[0]! }, ctx),
        ).toThrow(/Paused/);
      }
    });
  it("keeps the supplied wording intact while recording negotiated additions separately", () => {
    const s = createInitialState();
    s.onboarded = true;
    const ctx = { now, id: () => "proposal", random: () => 1 };
    let next = transition(
      s,
      { type: "agreement.propose", section: "Boundaries", text: "Extra check-in after a session" },
      ctx,
    );
    next = transition(next, { type: "view", role: "sub" }, ctx);
    next = transition(next, { type: "agreement.resolve", id: "proposal", accept: true }, ctx);
    expect(next.agreement.boundaries).toContain("Extra check-in after a session");
    expect(next.agreement.document?.markdown).toBe(AGREEMENT_MARKDOWN);
    expect(() =>
      transition(next, { type: "agreement.propose", section: "Safeword", text: "Ignore RED" }, ctx),
    ).toThrow(/valid agreement section/);
  });
});
