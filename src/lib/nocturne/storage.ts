import { z } from "zod";
import type { AppState } from "./types";
import { uid } from "./logic";
import { upgradeAgreement } from "./agreement-document";
import { pointsStateSchema, DEFAULT_LEVELS } from "./points";

const role = z.enum(["dom", "sub"]),
  stamp = z.string(),
  time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const status = z.enum([
  "pending",
  "submitted",
  "revision",
  "completed",
  "clarification",
  "extension",
  "excused",
  "skipped",
  "paused",
]);
const proof = z.enum(["confirmation", "text", "challenge"]);
const recurrence = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily") }),
  z.object({ kind: z.literal("weekdays"), days: z.array(z.number().int().min(0).max(6)) }),
  z.object({ kind: z.literal("once"), date: z.string() }),
]);
export const savedStateSchema = z.object({
  points: pointsStateSchema.default({ ledger: [], levels: DEFAULT_LEVELS }),
  version: z.union([z.literal(1), z.literal(2)]),
  onboarded: z.boolean(),
  myRole: role,
  viewRole: role,
  names: z.object({ dom: z.string(), sub: z.string() }),
  space: z.object({
    inviteCode: z.string(),
    paired: z.boolean(),
    mode: z.enum(["demo", "shared"]),
    id: z.string().optional(),
    timeZone: z.string().optional(),
  }),
  routines: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      instructions: z.string(),
      windowStart: time,
      windowEnd: time,
      dueTime: time.optional(),
      recurrence,
      reminderMinutes: z.number().nullable(),
      enabled: z.boolean(),
      requiresAck: z.boolean(),
      optInDaily: z.boolean(),
      proof: proof.default("text"),
      revision: z.number().default(1),
    }),
  ),
  tasks: z.record(
    z.string(),
    z.object({
      status,
      note: z.string().optional(),
      optedIn: z.boolean().optional(),
      acknowledged: z.boolean().optional(),
      updatedAt: stamp,
      by: role,
      dueTimeOverride: time.optional(),
      routineRevision: z.number().optional(),
    }),
  ),
  requests: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["illness", "extension", "permission", "routine_change", "skip"]),
      routineId: z.string().optional(),
      date: z.string(),
      reason: z.enum(["health", "emergency", "study_work", "sleep", "other", ""]),
      returnAt: z.string().optional(),
      note: z.string(),
      by: role,
      at: stamp,
      status: z.enum(["open", "accepted", "declined"]),
      response: z.string().optional(),
    }),
  ),
  agreement: z.object({
    document: z.object({ version: z.string(), markdown: z.string() }).optional(),
    checkInSignal: z.string().optional(),
    history: z
      .array(
        z.object({
          version: z.string(),
          archivedAt: stamp,
          document: z.object({ version: z.string(), markdown: z.string() }).optional(),
          boundaries: z.array(z.string()),
          excluded: z.array(z.string()),
          commWindows: z.string(),
          safeword: z.string(),
          emergencyContact: z.string(),
          lastReview: z.string(),
          ack: z.object({ dom: stamp.nullable(), sub: stamp.nullable() }),
          proposals: z.array(
            z.object({
              id: z.string(),
              by: role,
              section: z.string(),
              text: z.string(),
              at: stamp,
              status: z.enum(["open", "accepted", "declined"]),
            }),
          ),
        }),
      )
      .optional(),
    boundaries: z.array(z.string()),
    excluded: z.array(z.string()),
    commWindows: z.string(),
    safeword: z.string(),
    emergencyContact: z.string(),
    lastReview: z.string(),
    ack: z.object({ dom: stamp.nullable(), sub: stamp.nullable() }),
    proposals: z.array(
      z.object({
        id: z.string(),
        by: role,
        section: z.string(),
        text: z.string(),
        at: stamp,
        status: z.enum(["open", "accepted", "declined"]),
      }),
    ),
  }),
  pause: z.object({
    active: z.boolean(),
    by: role.optional(),
    at: stamp.optional(),
    reason: z.string().optional(),
    signal: z.enum(["RED", "YELLOW"]).optional(),
    resumeAck: z.object({ dom: z.boolean(), sub: z.boolean() }),
    sessionId: z.string().optional(),
  }),
  messages: z.array(
    z.object({
      id: z.string(),
      by: role,
      text: z.string(),
      at: stamp,
      routineId: z.string().optional(),
      channel: z.enum(["notes", "discussion"]).optional(),
      pauseSession: z.string().optional(),
    }),
  ),
  activity: z.array(
    z.object({ id: z.string(), at: stamp, by: z.enum(["dom", "sub", "system"]), text: z.string() }),
  ),
  prefs: z.object({ inAppReminders: z.boolean(), quietStart: time, quietEnd: time }),
  goals: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        instructions: z.string(),
        criteria: z.string(),
        dueDate: z.string(),
        category: z.enum(["personal", "wellbeing", "work", "relationship"]),
        status: z.enum(["active", "completed", "archived"]),
      }),
    )
    .default([]),
  submissions: z
    .array(
      z.object({
        id: z.string(),
        routineId: z.string(),
        routineTitle: z.string(),
        instructions: z.string(),
        routineRevision: z.number(),
        date: z.string(),
        text: z.string(),
        proof,
        at: stamp,
        status: z.enum(["open", "accepted", "revision", "rejected"]),
        response: z.string().optional(),
        reviewedAt: stamp.optional(),
        challengePrompt: z.string().optional(),
      }),
    )
    .default([]),
});

/** Validate before migration; never blindly cast arbitrary localStorage JSON. */
export function readStoredState(raw: string): AppState {
  const value = savedStateSchema.parse(JSON.parse(raw));
  if (value.space.mode !== "demo")
    throw new Error("Shared records must be loaded from the server.");
  const result = {
    ...value,
    version: 2,
    viewRole: value.myRole,
    space: { ...value.space, paired: false },
  } as AppState;
  if (value.pause.active && !value.pause.sessionId)
    result.pause = {
      ...result.pause,
      sessionId: uid(),
      resumeAck: { dom: false, sub: false },
    };
  if (value.version === 1)
    result.agreement = { ...result.agreement, ack: { dom: null, sub: null } };
  return upgradeAgreement(result, new Date());
}
