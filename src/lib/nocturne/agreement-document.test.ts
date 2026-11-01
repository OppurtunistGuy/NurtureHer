import { describe, expect, it } from "vitest";
import {
  AGREEMENT_MARKDOWN,
  CUSTOM_AGREEMENT_VERSION,
  PERSONAL_AGREEMENT_MARKDOWN,
  PERSONAL_AGREEMENT_VERSION,
  upgradeAgreement,
} from "./agreement-document";
import { sampleRoutines } from "@/test/sample-routines";
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
  it("starts new spaces with an empty agreement for the Master to write", () => {
    const s = createInitialState();
    expect(s.agreement.document).toEqual({ version: CUSTOM_AGREEMENT_VERSION, markdown: "" });
    expect(s.agreement.boundaries).toEqual([]);
    expect(s.agreement.excluded).toEqual([]);
    expect(s.agreement.commWindows).toBe("");
    expect(s.agreement.safeword).toBe("RED");
    expect(s.agreement.checkInSignal).toBe("YELLOW");
    expect(s.agreement.ack).toEqual({ dom: null, sub: null });
    expect(s.routines).toEqual([]);
    // The optional template stays neutral.
    expect(AGREEMENT_MARKDOWN).not.toContain("December 16");
    expect(AGREEMENT_MARKDOWN.match(/^### [1-7]\. /gm)).toHaveLength(7);
  });
  it("never replaces an agreement a couple already has, whatever its version", () => {
    for (const version of ["boundsome-template-2026-11-01-v1", CUSTOM_AGREEMENT_VERSION, "x"]) {
      const s = createInitialState();
      s.agreement.document = { version, markdown: "### Our rules\n\n- Be honest" };
      s.agreement.ack = { dom: stamp, sub: stamp };
      expect(upgradeAgreement(s, now)).toBe(s);
    }
  });
  it.each([false, true])(
    "keeps an existing space's personal agreement and acknowledgements untouched (paused=%s)",
    (paused) => {
      const state = createInitialState();
      state.agreement.document = {
        version: PERSONAL_AGREEMENT_VERSION,
        markdown: PERSONAL_AGREEMENT_MARKDOWN,
      };
      state.agreement.excluded = ["Our own limit"];
      state.agreement.ack = { dom: stamp, sub: stamp };
      state.pause.active = paused;
      expect(upgradeAgreement(state, now)).toBe(state);
      expect(readStoredState(JSON.stringify(state)).agreement).toEqual(state.agreement);
      // The legacy product heading is still renamed without touching anything else.
      state.agreement.document.markdown = PERSONAL_AGREEMENT_MARKDOWN.replace(
        /^# BoundSome/,
        "# NOCTURNE TOGETHER",
      );
      const renamed = upgradeAgreement(state, now);
      expect(renamed.agreement.document).toEqual({
        version: PERSONAL_AGREEMENT_VERSION,
        markdown: PERSONAL_AGREEMENT_MARKDOWN,
      });
      expect(renamed.agreement.ack).toEqual({ dom: stamp, sub: stamp });
      expect(renamed.agreement.excluded).toEqual(["Our own limit"]);
    },
  );
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
    expect(s.agreement.document).toEqual({ version: CUSTOM_AGREEMENT_VERSION, markdown: "" });
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
          transition(locked, { type: "routine.save", routine: sampleRoutines()[0]! }, ctx),
        ).toThrow(/Paused/);
      }
    });
  it("lets only the Master write the agreement, archives old wording and asks both again", () => {
    let s = createInitialState();
    s.onboarded = true;
    let i = 0;
    const ctx = { now, id: () => `${++i}`, random: () => 1 };
    expect(() => transition(s, { type: "agreement.write", markdown: "   " }, ctx)).toThrow(
      /Write the agreement/,
    );
    s = transition(s, { type: "agreement.write", markdown: "### Our rules\n\n- Be honest" }, ctx);
    expect(s.agreement.document).toEqual({
      version: CUSTOM_AGREEMENT_VERSION,
      markdown: "### Our rules\n\n- Be honest",
    });
    expect(s.agreement.history ?? []).toHaveLength(0);
    s = transition(s, { type: "agreement.ack" }, ctx);
    s = transition(s, { type: "view", role: "sub" }, ctx);
    s = transition(s, { type: "agreement.ack" }, ctx);
    expect(() =>
      transition(s, { type: "agreement.write", markdown: "Sub rewrites it" }, ctx),
    ).toThrow(/Only the Master/);
    s = transition(s, { type: "view", role: "dom" }, ctx);
    s = transition(s, { type: "agreement.write", markdown: "### Our rules\n\n- Be kind" }, ctx);
    expect(s.agreement.ack).toEqual({ dom: null, sub: null });
    expect(s.agreement.history?.[0]?.document?.markdown).toBe("### Our rules\n\n- Be honest");
    expect(s.agreement.history?.[0]?.ack.sub).toBeTruthy();
    // Locked while paused, like every other change.
    const paused = transition(s, { type: "pause", reason: "" }, ctx);
    expect(() => transition(paused, { type: "agreement.write", markdown: "X" }, ctx)).toThrow(
      /Paused/,
    );
  });
  it("adds an accepted change to the text and keeps list additions in their lists", () => {
    let s = createInitialState();
    s.onboarded = true;
    let i = 0;
    const ctx = { now, id: () => `p${++i}`, random: () => 1 };
    s = transition(s, { type: "agreement.write", markdown: "### Our rules\n\n- Be honest" }, ctx);
    s = transition(s, { type: "view", role: "sub" }, ctx);
    s = transition(
      s,
      { type: "agreement.propose", section: "Agreement text", text: "A call every Sunday" },
      ctx,
    );
    s = transition(
      s,
      { type: "agreement.propose", section: "Boundaries", text: "Extra check-in after a session" },
      ctx,
    );
    s = transition(s, { type: "view", role: "dom" }, ctx);
    for (const p of s.agreement.proposals)
      s = transition(s, { type: "agreement.resolve", id: p.id, accept: true }, ctx);
    expect(s.agreement.document?.markdown).toBe(
      "### Our rules\n\n- Be honest\n\n### Agreed additions\n\n- A call every Sunday",
    );
    expect(s.agreement.boundaries).toContain("Extra check-in after a session");
    expect(() =>
      transition(s, { type: "agreement.propose", section: "Safeword", text: "Ignore RED" }, ctx),
    ).toThrow(/valid agreement section/);
  });
});
