import { describe, expect, it } from "vitest";
import { transition, type Command, type Context } from "./engine";
import { createInitialState } from "./store";
import { dateKey, effectiveStatus, taskKey } from "./logic";
import { readStoredState } from "./storage";
import type { AppState, Goal } from "./types";

const now = new Date(2026, 9, 23, 10, 0),
  date = dateKey(now);
let sequence = 0;
const ctx: Context = { now, id: () => `test-${++sequence}`, random: () => 7 };
function fixture(role: "dom" | "sub" = "dom"): AppState {
  const s = createInitialState();
  return {
    ...s,
    onboarded: true,
    viewRole: role,
    myRole: role,
    agreement: { ...s.agreement, ack: { dom: now.toISOString(), sub: now.toISOString() } },
  };
}
const run = (s: AppState, cmd: Command, context = ctx) => transition(s, cmd, context);
const goal: Goal = {
  id: "goal",
  title: "Focus",
  instructions: "One focus block",
  criteria: "One written reflection",
  dueDate: date,
  category: "work",
  status: "active",
};
function blockedCommands(s: AppState): Command[] {
  const id = s.routines[0]!.id;
  return [
    { type: "routine.save", routine: s.routines[0]! },
    { type: "routine.delete", id },
    { type: "goal.save", goal },
    { type: "task.prepare", id, preparation: "optIn" },
    { type: "task.excuse", id },
    { type: "submission", id, text: "Done" },
    { type: "challenge", id },
    { type: "review", id: "submission", decision: "accepted", response: "" },
    { type: "request", request: { kind: "permission", date, reason: "", note: "Please" } },
    { type: "request.resolve", id: "request", accept: true, response: "" },
    { type: "agreement.ack" },
    { type: "agreement.propose", section: "Boundaries", text: "A change" },
    { type: "agreement.resolve", id: "proposal", accept: true },
    { type: "prefs", patch: { inAppReminders: false } },
    { type: "invite", code: "NEW-CODE" },
    { type: "reset", initial: createInitialState() },
    { type: "onboard", role: "dom", name: "X", partner: "Y" },
    { type: "message", channel: "notes", text: "A directive" },
  ];
}

describe("hard pause boundary", () => {
  for (const role of ["dom", "sub"] as const) {
    const initial = fixture(role);
    for (const command of blockedCommands(initial)) {
      it(`${role}: rejects ${command.type} even if UI guards are bypassed`, () => {
        const s = run(initial, { type: "pause", reason: "Rest" }),
          frozen = JSON.stringify(s);
        expect(() => run(s, command)).toThrow(/Paused/);
        expect(JSON.stringify(s)).toBe(frozen);
      });
    }
  }
  it("allows only discussion and mutual acknowledgement after both have spoken", () => {
    let s = run(fixture(), { type: "pause", reason: "" });
    expect(() => run(s, { type: "resume" })).toThrow(/Both people/);
    s = run(s, { type: "message", text: "I hear you.", channel: "discussion" });
    expect(() => run(s, { type: "resume" })).toThrow(/Both people/);
    s = run(s, { type: "view", role: "sub" });
    s = run(s, { type: "message", text: "I feel ready to discuss.", channel: "discussion" });
    s = run(s, { type: "resume" });
    expect(s.pause.active).toBe(true);
    expect(() => run(s, { type: "resume" })).toThrow(/already/);
    s = run(s, { type: "view", role: "dom" });
    s = run(s, { type: "resume" });
    expect(s.pause.active).toBe(false);
  });
  it("new discussion messages invalidate earlier readiness", () => {
    let s = run(fixture(), { type: "pause", reason: "" });
    s = run(s, { type: "message", channel: "discussion", text: "Hello" });
    s = run(s, { type: "view", role: "sub" });
    s = run(s, { type: "message", channel: "discussion", text: "Hello" });
    s = run(s, { type: "resume" });
    s = run(s, { type: "message", channel: "discussion", text: "One more concern" });
    expect(s.pause.resumeAck).toEqual({ dom: false, sub: false });
  });
  it("does not accept discussion from a previous pause", () => {
    let s = fixture();
    s.messages = ["dom", "sub"].map((by, i) => ({
      id: `${i}`,
      at: now.toISOString(),
      text: "old",
      by: by as "dom" | "sub",
      channel: "discussion",
      pauseSession: "old-pause",
    }));
    s = run(s, { type: "pause", reason: "new" });
    expect(() => run(s, { type: "resume" })).toThrow(/Both people/);
  });
  it("preserves existing completion while pausing other actionable statuses", () => {
    for (const status of ["pending", "clarification", "revision", "extension"] as const)
      expect(effectiveStatus({ status, updatedAt: "", by: "sub" }, true)).toBe("paused");
    expect(effectiveStatus({ status: "completed", updatedAt: "", by: "dom" }, true)).toBe(
      "completed",
    );
  });
});

describe("Master-led authority and review", () => {
  it("denies partner routine edits, deletion, goals, reviews and approvals", () => {
    const s = fixture("sub");
    const commands = blockedCommands(s).filter((x) =>
      [
        "routine.save",
        "routine.delete",
        "goal.save",
        "task.excuse",
        "review",
        "request.resolve",
        "invite",
      ].includes(x.type),
    );
    for (const cmd of commands) expect(() => run(s, cmd)).toThrow(/Only the Master/);
  });
  it("denies Master self-submission", () =>
    expect(() => run(fixture(), { type: "submission", id: "r", text: "Done" })).toThrow(
      /Only the partner/,
    ));
  it("submitting never completes a task; acceptance does", () => {
    let s = fixture("sub");
    const r = s.routines[0]!;
    const key = taskKey(r.id, date);
    s = run(s, { type: "submission", id: r.id, text: "I completed the morning check-in." });
    expect(s.tasks[key]?.status).toBe("submitted");
    expect(() => run(s, { type: "submission", id: r.id, text: "Duplicate" })).toThrow(/already/);
    const submission = s.submissions![0]!;
    s = run(s, { type: "view", role: "dom" });
    expect(() => run(s, { type: "routine.delete", id: r.id })).toThrow(/pending/);
    s = run(s, { type: "review", id: submission.id, decision: "accepted", response: "Thank you" });
    expect(s.tasks[key]?.status).toBe("completed");
    expect(() =>
      run(s, { type: "review", id: submission.id, decision: "accepted", response: "Again" }),
    ).toThrow(/already/);
  });
  it("requires feedback on rejection and preserves all submission attempts", () => {
    let s = fixture("sub");
    const r = s.routines[0]!;
    s = run(s, { type: "submission", id: r.id, text: "My reflection." });
    const entry = s.submissions![0]!;
    s = run(s, { type: "view", role: "dom" });
    expect(() =>
      run(s, { type: "review", id: entry.id, decision: "rejected", response: "" }),
    ).toThrow(/Enter/);
    s = run(s, {
      type: "review",
      id: entry.id,
      decision: "revision",
      response: "Please clarify what you did.",
    });
    s = run(s, { type: "view", role: "sub" });
    s = run(s, { type: "submission", id: r.id, text: "Here are the details." });
    expect(s.submissions).toHaveLength(2);
    expect(s.submissions![1]!.status).toBe("revision");
  });
  it("requires the current agreement, optional opt-in and latest instruction acknowledgement", () => {
    let s = fixture("sub");
    const r = { ...s.routines[0]!, optInDaily: true, requiresAck: true, revision: 2 };
    s.routines = [r];
    expect(() => run(s, { type: "submission", id: r.id, text: "Done" })).toThrow(/Opt in/);
    s = run(s, { type: "task.prepare", id: r.id, preparation: "optIn" });
    expect(() => run(s, { type: "submission", id: r.id, text: "Done" })).toThrow(/Acknowledge/);
    s = run(s, { type: "task.prepare", id: r.id, preparation: "acknowledge" });
    s.routines = [{ ...r, revision: 3 }];
    expect(() => run(s, { type: "submission", id: r.id, text: "Done" })).toThrow(/latest/);
    s.agreement.ack.dom = null;
    expect(() => run(s, { type: "task.prepare", id: r.id, preparation: "acknowledge" })).toThrow(
      /agreement/,
    );
  });
  it("preserves assigned instructions in the submission after edits", () => {
    let s = fixture("sub");
    const r = s.routines[0]!;
    s = run(s, { type: "submission", id: r.id, text: "Done" });
    s = run(s, { type: "view", role: "dom" });
    s = run(s, { type: "routine.save", routine: { ...r, instructions: "New instruction" } });
    expect(s.submissions![0]!.instructions).toBe(r.instructions);
  });
  it("rejects invalid schedules, unsupported media and blank goals", () => {
    const s = fixture(),
      r = s.routines[0]!;
    for (const patch of [
      { windowEnd: "01:00" },
      { dueTime: "23:59" },
      { reminderMinutes: -3 },
      { recurrence: { kind: "weekdays" as const, days: [] } },
      { recurrence: { kind: "once" as const, date: "2026-02-31" } },
      { proof: "camera" as "text" },
    ])
      expect(() => run(s, { type: "routine.save", routine: { ...r, ...patch } })).toThrow();
    expect(() => run(s, { type: "goal.save", goal: { ...goal, criteria: "" } })).toThrow();
    expect(run(s, { type: "goal.save", goal }).goals![0]).toEqual(goal);
  });
});

describe("neutral prompts are limited text evidence", () => {
  function start() {
    const s = fixture("sub"),
      r = { ...s.routines[0]!, proof: "challenge" as const };
    s.routines = [r];
    return run(s, { type: "challenge", id: r.id });
  }
  it("expires after 60 seconds and rejects reused sessions", () => {
    let s = start();
    const c = s.challenge!;
    expect(() =>
      run(
        s,
        { type: "submission", id: c.routineId, text: c.prompt, challengeId: c.id },
        { ...ctx, now: new Date(now.valueOf() + 60000) },
      ),
    ).toThrow(/fresh prompt/);
    expect(() =>
      run(s, { type: "submission", id: c.routineId, text: "No prompt", challengeId: c.id }),
    ).toThrow(/fresh prompt/);
    s = run(s, {
      type: "submission",
      id: c.routineId,
      text: `${c.prompt}: my reflection`,
      challengeId: c.id,
    });
    expect(s.challenge).toBeUndefined();
    expect(s.submissions![0]!.proof).toBe("challenge");
    expect(s.submissions![0]).not.toHaveProperty("confidence");
    expect(s.submissions![0]).not.toHaveProperty("identityVerified");
  });
  it("pause and preview changes invalidate the active session", () => {
    const s = start();
    expect(run(s, { type: "pause", reason: "" }).challenge).toBeUndefined();
    expect(run(s, { type: "view", role: "dom" }).challenge).toBeUndefined();
  });
  it("changing proof policy resets both agreement acknowledgements", () => {
    const s = fixture();
    const next = run(s, {
      type: "routine.save",
      routine: { ...s.routines[0]!, proof: "challenge", optInDaily: true },
    });
    expect(next.agreement.ack).toEqual({ dom: null, sub: null });
  });
});

describe("permissions and scheduling", () => {
  it("extension approval actually moves that date's deadline, not the routine", () => {
    let s = fixture("sub");
    const r = s.routines[0]!;
    s = run(s, {
      type: "request",
      request: {
        kind: "extension",
        routineId: r.id,
        date,
        reason: "study_work",
        note: "Work call",
        returnAt: "08:00",
      },
    });
    expect(s.tasks[taskKey(r.id, date)]).toBeUndefined();
    const q = s.requests[0]!;
    s = run(s, { type: "view", role: "dom" });
    s = run(s, { type: "request.resolve", id: q.id, accept: true, response: "Today only" });
    expect(s.tasks[taskKey(r.id, date)]!.dueTimeOverride).toBe("08:00");
    expect(s.routines[0]!.windowEnd).toBe(r.windowEnd);
    expect(() =>
      run(s, { type: "request.resolve", id: q.id, accept: false, response: "Changed mind" }),
    ).toThrow(/already/);
  });
  it("illness excuses only routines actually scheduled on the requested day", () => {
    let s = fixture("sub");
    s.routines.push({
      ...s.routines[0]!,
      id: "tomorrow",
      recurrence: { kind: "once", date: "2026-10-24" },
    });
    s = run(s, { type: "request", request: { kind: "illness", date, reason: "health", note: "" } });
    s = run(s, { type: "view", role: "dom" });
    s = run(s, { type: "request.resolve", id: s.requests[0]!.id, accept: true, response: "Rest" });
    expect(s.tasks[taskKey("tomorrow", date)]).toBeUndefined();
    expect(s.tasks[taskKey(s.routines[0]!.id, date)]!.status).toBe("excused");
  });
  it("prevents duplicate open requests and invalid extension times", () => {
    let s = fixture("sub");
    const r = s.routines[0]!;
    expect(() =>
      run(s, {
        type: "request",
        request: {
          kind: "extension",
          routineId: r.id,
          date,
          reason: "",
          note: "",
          returnAt: "04:00",
        },
      }),
    ).toThrow(/after/);
    const command: Command = {
      type: "request",
      request: { kind: "permission", date, reason: "", note: "May I change the goal?" },
    };
    s = run(s, command);
    expect(() => run(s, command)).toThrow(/already open/);
  });
  it("routine change approval does not silently edit the routine", () => {
    let s = fixture("sub");
    const r = s.routines[0]!;
    s = run(s, {
      type: "request",
      request: { kind: "routine_change", routineId: r.id, date, reason: "", note: "Move to 8am" },
    });
    s = run(s, { type: "view", role: "dom" });
    s = run(s, {
      type: "request.resolve",
      id: s.requests[0]!.id,
      accept: true,
      response: "Will revise",
    });
    expect(s.routines[0]).toEqual(r);
  });
});

describe("legacy data migration", () => {
  it("keeps old routines/tasks/messages, adds empty new collections, and asks for re-acknowledgement", () => {
    const s = fixture();
    const old = {
      ...s,
      version: 1,
      goals: undefined,
      submissions: undefined,
      routines: s.routines.map(({ proof: _proof, revision: _revision, ...r }) => r),
    };
    const migrated = readStoredState(JSON.stringify(old));
    expect(migrated.version).toBe(2);
    expect(migrated.routines).toHaveLength(s.routines.length);
    expect(migrated.goals).toEqual([]);
    expect(migrated.agreement.ack).toEqual({ dom: null, sub: null });
  });
  it("old active pauses get a fresh discussion session and cannot resume immediately", () => {
    const s = fixture();
    s.pause = { active: true, resumeAck: { dom: true, sub: true } };
    const migrated = readStoredState(JSON.stringify(s));
    expect(migrated.pause.sessionId).toBeTruthy();
    expect(migrated.pause.resumeAck).toEqual({ dom: false, sub: false });
    expect(() => run(migrated, { type: "resume" })).toThrow(/Both people/);
  });
  it("rejects corrupted JSON and structurally invalid state", () => {
    expect(() => readStoredState("{broken")).toThrow();
    expect(() => readStoredState(JSON.stringify({ version: 2, routines: [] }))).toThrow();
  });
});
