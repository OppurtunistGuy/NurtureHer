import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { dateKey, randomInviteCode, uid } from "./logic";
import { transition, type Command } from "./engine";
import { readStoredState } from "./storage";
import { createAgreement, upgradeAgreement } from "./agreement-document";
import type { AppState, Goal, PartnerRequest, Role, Routine, Submission } from "./types";

const KEY = "nocturne.demo.v1";
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

let state = createInitialState();
const serverState = state;
let loaded = false;
let lastRaw: string | null = null;
let memoryOnly = false;
const listeners = new Set<() => void>();
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = readStoredState(raw);
    lastRaw = raw;
  } catch {
    state = {
      ...state,
      storageWarning:
        "Saved demo data is invalid. Changes are blocked to protect it. Clear the demo in Settings only if you want to discard it.",
    };
    toast.error("Saved demo could not be loaded", {
      description:
        "The original saved data was not overwritten. Clear it in Settings only if you want a fresh start.",
    });
  }
}
function subscribe(l: () => void) {
  load();
  listeners.add(l);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY && event.key !== null) return;
    refresh();
    listeners.forEach((listener) => listener());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}
function refresh() {
  if (memoryOnly) return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === lastRaw) return;
    const viewRole = state.viewRole;
    state = raw ? { ...readStoredState(raw), viewRole } : createInitialState();
    lastRaw = raw;
  } catch {
    state = {
      ...state,
      storageWarning:
        "Another tab contains invalid demo data. Changes are blocked until the demo is cleared in Settings.",
    };
  }
}
export function useNocturne() {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return state;
    },
    () => serverState,
  );
}
export type ActionResult = { ok: true } | { ok: false; error: string };
function dispatch(command: Command): ActionResult {
  load();
  refresh();
  try {
    if (state.storageWarning && !["view", "reset"].includes(command.type))
      throw new Error(state.storageWarning);
    const next = upgradeAgreement(
      transition(state, command, {
        now: new Date(),
        id: uid,
        random: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
      }),
      new Date(),
    );
    state = next;
    // Demo perspective and challenge are ephemeral; perspective is NOT authentication.
    if (command.type !== "view" && command.type !== "challenge") {
      try {
        const { challenge: _ephemeral, storageWarning: _warning, ...persisted } = next;
        const raw = JSON.stringify({ ...persisted, viewRole: next.myRole });
        localStorage.setItem(KEY, raw);
        lastRaw = raw;
        memoryOnly = false;
      } catch {
        memoryOnly = true;
        toast.error("Changes are only in memory", {
          description: "Browser storage is unavailable or full. Reloading may lose these changes.",
        });
      }
    }
    listeners.forEach((l) => l());
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Action not allowed.";
    toast.error(error);
    return { ok: false, error };
  }
}

export const actions = {
  onboard: (role: Role, name: string, partner: string) =>
    dispatch({ type: "onboard", role, name, partner }),
  setView: (role: Role) => dispatch({ type: "view", role }),
  regenerateInvite: () => dispatch({ type: "invite", code: randomInviteCode() }),
  reset: () => dispatch({ type: "reset", initial: createInitialState() }),
  saveRoutine: (routine: Routine) => dispatch({ type: "routine.save", routine }),
  deleteRoutine: (id: string) => dispatch({ type: "routine.delete", id }),
  saveGoal: (goal: Goal) => dispatch({ type: "goal.save", goal }),
  prepareTask: (id: string, preparation: "optIn" | "acknowledge" | "decline") =>
    dispatch({ type: "task.prepare", id, preparation }),
  excuseTask: (id: string) => dispatch({ type: "task.excuse", id }),
  generateChallenge: (id: string) => dispatch({ type: "challenge", id }),
  submitProof: (id: string, text: string, challengeId?: string) =>
    dispatch({ type: "submission", id, text, challengeId }),
  review: (
    id: string,
    decision: Extract<Submission["status"], "accepted" | "revision" | "rejected">,
    response: string,
  ) => dispatch({ type: "review", id, decision, response }),
  submitRequest: (request: Omit<PartnerRequest, "id" | "at" | "by" | "status">) =>
    dispatch({ type: "request", request }),
  respondRequest: (id: string, accept: boolean, response: string) =>
    dispatch({ type: "request.resolve", id, accept, response }),
  pause: (reason: string, signal?: "RED" | "YELLOW") =>
    dispatch({ type: "pause", reason, ...(signal ? { signal } : {}) }),
  ackResume: () => dispatch({ type: "resume" }),
  acknowledgeAgreement: () => dispatch({ type: "agreement.ack" }),
  propose: (section: string, text: string) =>
    dispatch({ type: "agreement.propose", section, text }),
  resolveProposal: (id: string, accept: boolean) =>
    dispatch({ type: "agreement.resolve", id, accept }),
  sendMessage: (text: string, channel: "notes" | "discussion" = "notes", routineId?: string) =>
    dispatch({ type: "message", text, channel, routineId }),
  setPrefs: (patch: Partial<AppState["prefs"]>) => dispatch({ type: "prefs", patch }),
};
export function todayKey() {
  return dateKey();
}
