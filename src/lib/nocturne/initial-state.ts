import { dateKey, randomInviteCode, uid } from "./logic";
import { DEFAULT_LEVELS } from "./points";
import { createAgreement } from "./agreement-document";
import type { AppState, Routine } from "./types";

export function createInitialState(): AppState {
  const r = (
    title: string,
    windowStart: string,
    windowEnd: string,
    instructions: string,
    extra: Partial<Routine> = {},
  ): Routine => ({
    id: uid(),
    title,
    windowStart,
    windowEnd,
    instructions,
    recurrence: { kind: "daily" },
    reminderMinutes: 10,
    enabled: true,
    requiresAck: false,
    optInDaily: false,
    proof: "text",
    revision: 1,
    ...extra,
  });
  return {
    version: 2,
    onboarded: false,
    myRole: "dom",
    viewRole: "dom",
    names: { dom: "Master", sub: "Sub" },
    space: { inviteCode: randomInviteCode(), paired: false, mode: "demo" },
    // No sample routines: a new space or demo starts empty, so nobody mistakes samples for real ones.
    routines: [],
    tasks: {},
    points: { ledger: [], levels: DEFAULT_LEVELS.map((level) => ({ ...level })) },
    requests: [],
    goals: [],
    submissions: [],
    agreement: createAgreement(dateKey()),
    pause: { active: false, resumeAck: { dom: false, sub: false } },
    messages: [],
    activity: [
      {
        id: uid(),
        at: new Date().toISOString(),
        by: "system",
        text: "Single-device demo created with the supplied Master & Sub Agreement. Example routines are editable by the Master.",
      },
    ],
    prefs: { inAppReminders: true, quietStart: "23:00", quietEnd: "05:00" },
  };
}
