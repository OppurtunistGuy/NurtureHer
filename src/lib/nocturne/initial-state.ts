import { dateKey, randomInviteCode, uid } from "./logic";
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
    routines: [
      r("Wake-up check-in", "05:30", "06:00", "A short good-morning note when you're up."),
      r(
        "Morning ritual",
        "06:00",
        "06:45",
        "Water, a gentle stretch, and one intention for the day.",
        { requiresAck: true },
      ),
      r(
        "Shower check-in",
        "06:45",
        "07:30",
        "Text-only confirmation. Never capture private activities.",
        { proof: "confirmation" },
      ),
      r(
        "Outfit check-in",
        "07:30",
        "08:15",
        "Describe your outfit in words. No photo or camera access.",
        { recurrence: { kind: "weekdays", days: [1, 2, 3, 4, 5] } },
      ),
      r(
        "Focus challenge",
        "12:00",
        "20:00",
        "Optional: choose one focus block and reflect on how it went.",
        { optInDaily: true, reminderMinutes: null },
      ),
      r("Evening reflection", "22:00", "22:45", "One line about your day, then rest."),
    ],
    tasks: {},
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
