import type { Heat } from "./games/types";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { dateKey, randomInviteCode, uid } from "./logic";
import { transition, type Command } from "./engine";
import { readStoredState } from "./storage";
import { upgradeAgreement } from "./agreement-document";
import type { AppState, Goal, PartnerRequest, Role, Routine, Submission } from "./types";
import type { SpaceSnapshot } from "./space-protocol";
import type { PointsAward, PointsLevel } from "./points";

const KEY = "nocturne.demo.v1";
export { createInitialState } from "./initial-state";
import { createInitialState } from "./initial-state";

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
  if (!started) {
    started = true;
    void restoreSharedSpace();
  }
  if (!poll)
    poll = window.setInterval(() => {
      if (
        state.space.mode === "shared" &&
        !connection.busy &&
        document.visibilityState !== "hidden"
      )
        void restoreSharedSpace();
    }, 2000);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY && event.key !== null) return;
    refresh();
    listeners.forEach((listener) => listener());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    if (!listeners.size && poll) {
      window.clearInterval(poll);
      poll = undefined;
    }
    window.removeEventListener("storage", onStorage);
  };
}
function refresh() {
  if (memoryOnly || state.space.mode === "shared") return;
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
    if (state.space.mode === "shared")
      throw new Error("Shared-space changes must be confirmed by the server.");
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

function makeActions<T>(dispatch: (command: Command) => T) {
  return {
    awardPoints: (entry: PointsAward) => dispatch({ type: "points.award", entry }),
    adjustPoints: (id: string, action: "resolve" | "void", note: string) =>
      dispatch({ type: "points.adjust", id, action, note }),
    savePointLevels: (levels: PointsLevel[]) => dispatch({ type: "points.levels", levels }),
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
    startGame: (heat: Heat, masterOnlyRoll: boolean) =>
      dispatch({ type: "game.start", game: "dice", heat, masterOnlyRoll }),
    joinGame: () => dispatch({ type: "game.join" }),
    rollDice: () => dispatch({ type: "game.roll" }),
    finishCard: () => dispatch({ type: "game.done" }),
    skipCard: () => dispatch({ type: "game.skip" }),
    yellowCard: () => dispatch({ type: "game.yellow" }),
    stopGame: () => dispatch({ type: "game.stop" }),
    redGame: () => dispatch({ type: "game.red" }),
    hideCard: (cardId: string) => dispatch({ type: "game.hide", cardId }),
    refuseCard: (cardId: string) => dispatch({ type: "game.refuse", cardId }),
  };
}
export const actions = makeActions(dispatch);

type Connection = {
  status: "checking" | "none" | "connected" | "offline";
  busy: boolean;
  error: string;
  revision: number;
  invite: SpaceSnapshot["invite"];
  createdByMe: boolean;
  spaces: SpaceSnapshot["spaces"];
  telegram: SpaceSnapshot["telegram"];
  features: { games: boolean };
};
const initialConnection: Connection = {
  status: "checking",
  busy: false,
  error: "",
  revision: 0,
  invite: null,
  createdByMe: false,
  spaces: [],
  telegram: { configured: false, proofs: [] },
  features: { games: false },
};
let connection = initialConnection;
let started = false,
  poll: number | undefined,
  generation = 0,
  inFlight = 0;
const emit = () => listeners.forEach((listener) => listener());
export function useSpaceConnection() {
  return useSyncExternalStore(
    subscribe,
    () => connection,
    () => initialConnection,
  );
}
function connect(snapshot: SpaceSnapshot) {
  if (state.space.id === snapshot.state.space.id && connection.revision > snapshot.revision) return;
  if (
    state.space.id === snapshot.state.space.id &&
    connection.revision === snapshot.revision &&
    connection.invite?.token === snapshot.invite?.token &&
    JSON.stringify(connection.spaces) === JSON.stringify(snapshot.spaces) &&
    JSON.stringify(connection.telegram) === JSON.stringify(snapshot.telegram) &&
    connection.features.games === (snapshot.features?.games ?? false) &&
    connection.status === "connected" &&
    !connection.error
  )
    return;
  state = snapshot.state;
  try {
    sessionStorage.setItem("nocturne.active-space", state.space.id!);
  } catch {
    /* per-tab memory still works */
  }
  connection = {
    ...connection,
    status: "connected",
    error: "",
    revision: snapshot.revision,
    invite: snapshot.invite,
    createdByMe: snapshot.createdByMe,
    spaces: snapshot.spaces,
    telegram: snapshot.telegram,
    features: { games: snapshot.features?.games ?? false },
  };
  emit();
}
function activeSpace() {
  if (state.space.mode === "shared") return state.space.id;
  try {
    return sessionStorage.getItem("nocturne.active-space") ?? undefined;
  } catch {
    return undefined;
  }
}
async function requestSpace(body?: unknown, spaceId = activeSpace()) {
  const response = await fetch(
    `/api/space${!body && spaceId ? `?space=${encodeURIComponent(spaceId)}` : ""}`,
    {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      ...(body
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    },
  );
  const data = await response.json();
  return { response, data };
}
/** After sign-out: forget every shared space in this tab and fall back to the solo demo. */
export function leaveSharedSession() {
  generation++;
  try {
    sessionStorage.removeItem("nocturne.active-space");
  } catch {
    /* nothing stored */
  }
  loaded = false;
  state = createInitialState();
  load();
  connection = { ...initialConnection, status: "none" };
  emit();
}
export async function restoreSharedSpace() {
  const currentGeneration = generation;
  try {
    const { response, data } = await requestSpace();
    if (generation !== currentGeneration) return;
    if (response.ok) connect(data as SpaceSnapshot);
    else if (response.status === 401 && state.space.mode !== "shared") {
      connection = { ...connection, status: "none", error: "" };
      emit();
    } else {
      connection = {
        ...connection,
        status: "offline",
        error: data.error ?? "Unable to open your space.",
      };
      emit();
    }
  } catch {
    if (generation !== currentGeneration) return;
    connection = {
      ...connection,
      status: "offline",
      error:
        "Cannot reach the shared space. Check your connection and retry. Nothing has been replaced.",
    };
    emit();
  }
}
async function changeSpace(body: Record<string, unknown>): Promise<ActionResult> {
  const safetyStop =
    body["op"] === "command" && (body["command"] as Command | undefined)?.type === "pause";
  if (connection.busy && !safetyStop)
    return { ok: false, error: "Wait for the current change to finish." };
  const targetSpace = state.space.id;
  const scoped = ["command", "profile", "rotate"].includes(String(body["op"]));
  generation++;
  inFlight++;
  connection = { ...connection, busy: true };
  emit();
  try {
    const { response, data } = await requestSpace({
      ...body,
      ...(scoped ? { spaceId: targetSpace } : {}),
    });
    if (!response.ok) {
      if (data.snapshot && (!scoped || state.space.id === targetSpace))
        connect(data.snapshot as SpaceSnapshot);
      throw new Error(data.error ?? "The change could not be saved. Please retry.");
    }
    if (!scoped || state.space.id === targetSpace) connect(data as SpaceSnapshot);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save this change.";
    if (!scoped || state.space.id === targetSpace) connection = { ...connection, error: message };
    toast.error(message);
    return { ok: false, error: message };
  } finally {
    inFlight--;
    connection = { ...connection, busy: inFlight > 0 };
    emit();
  }
}
export const uiActions = makeActions(async (command: Command): Promise<ActionResult> => {
  if (state.space.mode !== "shared") return dispatch(command);
  if (command.type === "invite")
    return changeSpace({ op: "rotate", revision: connection.revision });
  return changeSpace({ op: "command", command, revision: connection.revision });
});
export const spaceActions = {
  open: async (spaceId: string): Promise<ActionResult> => {
    if (connection.busy) return { ok: false, error: "Wait for the current change to finish." };
    generation++;
    const selected = generation;
    inFlight++;
    connection = { ...connection, busy: true };
    emit();
    try {
      const { response, data } = await requestSpace(undefined, spaceId);
      if (!response.ok) throw new Error(data.error ?? "Cannot open this space.");
      if (selected !== generation) return { ok: false, error: "Selection changed." };
      connect(data as SpaceSnapshot);
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Cannot open this space.";
      toast.error(error);
      return { ok: false, error };
    } finally {
      inFlight--;
      connection = { ...connection, busy: inFlight > 0 };
      emit();
    }
  },
  create: (name: string, role: Role) =>
    changeSpace({
      op: "create",
      name,
      role,
      adult: true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  join: (name: string, token: string) => changeSpace({ op: "join", name, token, adult: true }),
  rename: (name: string) => changeSpace({ op: "profile", name, revision: connection.revision }),
  preview: async (token: string): Promise<{ creatorName: string; role: Role }> => {
    const { response, data } = await requestSpace({ op: "preview", token });
    if (!response.ok) throw new Error(data.error ?? "This invitation cannot be opened.");
    return data;
  },
};
export function todayKey() {
  return dateKey(new Date(), state.space.timeZone);
}

/** True only for a shared space on a server that has Games switched on. */
export function useGamesEnabled(): boolean {
  const connection = useSpaceConnection();
  const s = useNocturne();
  return s.space.mode === "shared" && connection.features.games;
}
