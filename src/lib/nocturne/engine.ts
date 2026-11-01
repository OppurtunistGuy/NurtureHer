import { dateKey, minutesOf, occursOn, taskKey } from "./logic";
import type { AppState, Goal, PartnerRequest, Role, Routine, Submission } from "./types";
import { rollDice } from "./games/dice";
import { pickCategory, spinWheel } from "./games/wheel";
import { hardLimitsFromState } from "./games/limits";
import { complete, createSession, join, nextTurn, red, skip, stop, yellow } from "./games/session";
import { STARTER_DECK } from "./games/starter-deck";
import {
  EMPTY_GAMES,
  HEAT_ORDER,
  type CardCategory,
  type GameId,
  type GameSession,
  type GamesState,
  type Heat,
  type Result,
} from "./games/types";
import {
  DEFAULT_LEVELS,
  pointsAwardSchema,
  pointsLevelsSchema,
  type PointsAward,
  type PointsLevel,
} from "./points";

export type Command =
  | { type: "points.award"; entry: PointsAward }
  | { type: "points.adjust"; id: string; action: "resolve" | "void"; note: string }
  | { type: "points.levels"; levels: PointsLevel[] }
  | { type: "onboard"; role: Role; name: string; partner: string }
  | { type: "view"; role: Role }
  | { type: "invite"; code: string }
  | { type: "reset"; initial: AppState }
  | { type: "routine.save"; routine: Routine }
  | { type: "routine.delete"; id: string }
  | { type: "goal.save"; goal: Goal }
  | { type: "task.prepare"; id: string; preparation: "optIn" | "acknowledge" | "decline" }
  | { type: "task.excuse"; id: string }
  | { type: "submission"; id: string; text: string; challengeId?: string | undefined }
  | { type: "challenge"; id: string }
  | { type: "review"; id: string; decision: "accepted" | "revision" | "rejected"; response: string }
  | { type: "request"; request: Omit<PartnerRequest, "id" | "at" | "by" | "status"> }
  | { type: "request.resolve"; id: string; accept: boolean; response: string }
  | { type: "pause"; reason: string; signal?: "RED" | "YELLOW" }
  | {
      type: "message";
      text: string;
      channel: "notes" | "discussion";
      routineId?: string | undefined;
    }
  | { type: "resume" }
  | { type: "agreement.ack" }
  | { type: "agreement.propose"; section: string; text: string }
  | { type: "agreement.resolve"; id: string; accept: boolean }
  | { type: "prefs"; patch: Partial<AppState["prefs"]> }
  | { type: "game.start"; game: GameId; heat: Heat; masterOnlyRoll: boolean }
  | { type: "game.join" }
  | { type: "game.roll" }
  | { type: "game.spin" }
  | { type: "game.pick"; category: CardCategory }
  | { type: "game.done" }
  | { type: "game.skip" }
  | { type: "game.yellow" }
  | { type: "game.stop" }
  | { type: "game.red" }
  | { type: "game.hide"; cardId: string }
  | { type: "game.refuse"; cardId: string };

export interface Context {
  now: Date;
  id: () => string;
  random: () => number;
}
// Allowlist, not a blacklist: future commands are locked by default during pause.
// A game can always be stopped, even while paused: safety first.
const duringPause: Command["type"][] = ["view", "message", "resume", "game.stop", "game.red"];
const commander: Command["type"][] = [
  "points.award",
  "points.adjust",
  "points.levels",
  "routine.save",
  "routine.delete",
  "goal.save",
  "task.excuse",
  "review",
  "request.resolve",
  "invite",
  "game.hide",
];
const partner: Command["type"][] = [
  "task.prepare",
  "submission",
  "challenge",
  "request",
  "game.refuse",
];

const ok = (value: GameSession): Result<GameSession> => ({ ok: true, value });
const gamesOf = (s: AppState): GamesState => s.games ?? EMPTY_GAMES;
function liveGame(s: AppState): GameSession {
  const session = gamesOf(s).session;
  requireThat(session, "There's no game to play. Start one first.");
  return session;
}
const gameDeal = (s: AppState) => ({
  hardLimits: hardLimitsFromState(s),
  hidden: gamesOf(s).hidden,
  notForMe: gamesOf(s).notForMe,
});
/** The context's random is a 32-bit integer; games want a number from 0 up to 1. */
const gameRandom = (ctx: Context) => () => (ctx.random() / 4294967296) % 1;
function applyGame(
  s: AppState,
  result: Result<GameSession>,
  log: (next: AppState, text: string) => AppState,
  text?: string,
): AppState {
  if (!result.ok) throw new Error(result.error);
  const next = { ...s, games: { ...gamesOf(s), session: result.value } };
  // Card text stays out of the shared activity log.
  return text ? log(next, text) : next;
}
export function agreementReady(s: AppState) {
  return !!(s.agreement.ack.dom && s.agreement.ack.sub);
}
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function nonempty(value: string, max: number) {
  requireThat(
    value.trim().length > 0 && value.length <= max,
    `Enter a value of 1–${max} characters.`,
  );
}
const time = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function validDate(value: string) {
  const d = new Date(`${value}T12:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(d.valueOf()) && dateKey(d) === value;
}
function validateRoutine(r: Routine) {
  nonempty(r.id, 100);
  nonempty(r.title, 60);
  requireThat(r.instructions.length <= 500, "Instructions are too long.");
  requireThat(
    time(r.windowStart) && time(r.windowEnd) && r.windowStart < r.windowEnd,
    "Use a same-day window with an end after its start.",
  );
  requireThat(
    !r.dueTime || (time(r.dueTime) && r.dueTime >= r.windowStart && r.dueTime <= r.windowEnd),
    "Due time must be inside the routine window.",
  );
  requireThat(
    r.reminderMinutes === null ||
      (Number.isInteger(r.reminderMinutes) && r.reminderMinutes >= 0 && r.reminderMinutes <= 240),
    "Reminder must be 0–240 minutes.",
  );
  requireThat(
    !r.proof || ["confirmation", "text", "challenge"].includes(r.proof),
    "Camera/media proof is unavailable in this web demo.",
  );
  requireThat(
    r.proof !== "challenge" || r.optInDaily,
    "Neutral-prompt routines require daily opt-in.",
  );
  if (r.recurrence.kind === "weekdays")
    requireThat(
      r.recurrence.days.length &&
        r.recurrence.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      "Select at least one valid day.",
    );
  if (r.recurrence.kind === "once")
    requireThat(validDate(r.recurrence.date), "Choose a valid date.");
}

/** Pure, fail-closed domain boundary. In production this MUST execute on the server
 * with a session-derived actor; the local demo role switch is not authentication. */
export function transition(s: AppState, cmd: Command, ctx: Context): AppState {
  const by = s.viewRole,
    at = ctx.now.toISOString(),
    today = dateKey(ctx.now, s.space.timeZone);
  const log = (next: AppState, text: string, actor: Role | "system" = by): AppState => ({
    ...next,
    activity: [{ id: ctx.id(), at, by: actor, text }, ...next.activity].slice(0, 300),
  });
  if (s.pause.active)
    requireThat(
      duringPause.includes(cmd.type) && (cmd.type !== "message" || cmd.channel === "discussion"),
      "Paused: operational changes are locked. Use Discussion to talk and resume together.",
    );
  if (commander.includes(cmd.type))
    requireThat(by === "dom", "Only the Master can perform this action.");
  if (partner.includes(cmd.type))
    requireThat(by === "sub", "Only the partner can submit this action.");
  if (!["onboard", "view", "reset"].includes(cmd.type))
    requireThat(s.onboarded, "Set up the demo first.");
  if (["submission", "challenge", "task.prepare"].includes(cmd.type))
    requireThat(agreementReady(s), "Both people must acknowledge the agreement first.");
  if (cmd.type.startsWith("game."))
    requireThat(agreementReady(s), "Both people must acknowledge the agreement before playing.");
  if (cmd.type.startsWith("points."))
    requireThat(
      agreementReady(s),
      "Both people must acknowledge the agreement before recording points.",
    );
  const routine = (id: string) => {
    const r = s.routines.find((x) => x.id === id);
    requireThat(r, "Routine no longer exists.");
    return r;
  };
  const task = (id: string) => {
    const r = routine(id);
    requireThat(occursOn(r, today), "This routine is not scheduled today.");
    return r;
  };
  switch (cmd.type) {
    case "points.award": {
      const entry = pointsAwardSchema.parse(cmd.entry);
      const points = s.points ?? { ledger: [], levels: DEFAULT_LEVELS };
      requireThat(
        !points.ledger.some((item) => item.id === entry.id),
        "This points entry was already recorded.",
      );
      if (entry.submissionId) {
        requireThat(entry.kind === "reward", "Only rewards may link to an accepted check-in.");
        requireThat(
          s.submissions?.some(
            (item) => item.id === entry.submissionId && item.status === "accepted",
          ),
          "Select an accepted check-in from this space.",
        );
        requireThat(
          !points.ledger.some((item) => item.submissionId === entry.submissionId && !item.voidedAt),
          "That check-in already has a reward.",
        );
      }
      return log(
        { ...s, points: { ...points, ledger: [{ ...entry, at, by: "dom" }, ...points.ledger] } },
        `Recorded ${entry.amount} ${entry.kind} points: ${entry.reason}`,
      );
    }
    case "points.adjust": {
      nonempty(cmd.note, 500);
      const points = s.points ?? { ledger: [], levels: DEFAULT_LEVELS };
      const entry = points.ledger.find((item) => item.id === cmd.id);
      requireThat(entry && !entry.voidedAt, "This entry is unavailable or already reversed.");
      requireThat(cmd.action === "void" || cmd.action === "resolve", "Choose resolve or reverse.");
      requireThat(
        cmd.action !== "resolve" || (entry.kind === "punishment" && !entry.resolvedAt),
        "Only outstanding punishment points can be resolved.",
      );
      return log(
        {
          ...s,
          points: {
            ...points,
            ledger: points.ledger.map((item) =>
              item.id !== cmd.id
                ? item
                : {
                    ...item,
                    ...(cmd.action === "void"
                      ? { voidedAt: at, voidReason: cmd.note.trim() }
                      : { resolvedAt: at, resolution: cmd.note.trim() }),
                  },
            ),
          },
        },
        `${cmd.action === "void" ? "Reversed" : "Resolved"} points entry: ${cmd.note.trim()}`,
      );
    }
    case "points.levels": {
      const levels = pointsLevelsSchema.parse(cmd.levels);
      return log(
        { ...s, points: { ledger: s.points?.ledger ?? [], levels } },
        "Updated reward level labels and milestone thresholds.",
      );
    }
    case "game.start": {
      requireThat(s.space.paired, "Games need both people in the space.");
      requireThat(cmd.game === "dice" || cmd.game === "wheel", "That game isn't available yet.");
      requireThat(HEAT_ORDER.includes(cmd.heat), "Choose Sweet, Spicy or Hot.");
      requireThat(
        !cmd.masterOnlyRoll || by === "dom",
        "Only the Master can keep the roll to themselves.",
      );
      const g = gamesOf(s);
      requireThat(
        !g.session || g.session.status === "stopped",
        "A game is already running. Stop it first.",
      );
      const started = join(createSession(ctx.id(), cmd.game, cmd.heat, cmd.masterOnlyRoll), by);
      return applyGame(
        s,
        started,
        log,
        `Started a ${cmd.game === "wheel" ? "Wheel of Fortune" : "Dice Roll"} game. Waiting for the other person to join.`,
      );
    }
    case "game.join":
      return applyGame(s, join(liveGame(s), by), log, "Joined the game.");
    case "game.roll":
      return applyGame(
        s,
        rollDice(liveGame(s), by, STARTER_DECK, gameDeal(s), gameRandom(ctx)),
        log,
      );
    case "game.spin":
      return applyGame(
        s,
        spinWheel(liveGame(s), by, STARTER_DECK, gameDeal(s), gameRandom(ctx)),
        log,
      );
    case "game.pick":
      return applyGame(
        s,
        pickCategory(liveGame(s), by, cmd.category, STARTER_DECK, gameDeal(s), gameRandom(ctx)),
        log,
      );
    case "game.done": {
      const finished = complete(liveGame(s));
      if (!finished.ok) throw new Error(finished.error);
      return applyGame(s, nextTurn(finished.value), log);
    }
    case "game.skip": {
      const session = liveGame(s);
      requireThat(session.turn === by, "Only the person whose card it is can skip it.");
      const skipped = skip(session, by);
      if (!skipped.ok) throw new Error(skipped.error);
      return applyGame(s, nextTurn(skipped.value), log);
    }
    case "game.yellow": {
      const skipped = yellow(liveGame(s));
      if (!skipped.ok) throw new Error(skipped.error);
      return applyGame(s, nextTurn(skipped.value), log, "YELLOW: skipped the card.");
    }
    case "game.stop":
      return applyGame(s, ok(stop(liveGame(s), by)), log, "Ended the game.");
    case "game.red":
      return applyGame(s, ok(red(liveGame(s), by)), log, "RED: ended the game immediately.");
    case "game.hide": {
      nonempty(cmd.cardId, 100);
      const g = gamesOf(s);
      return { ...s, games: { ...g, hidden: [...new Set([...g.hidden, cmd.cardId])] } };
    }
    case "game.refuse": {
      nonempty(cmd.cardId, 100);
      const g = gamesOf(s);
      return { ...s, games: { ...g, notForMe: [...new Set([...g.notForMe, cmd.cardId])] } };
    }
    case "view":
      return { ...s, viewRole: cmd.role, challenge: undefined };
    case "onboard": {
      requireThat(!s.onboarded, "Already set up.");
      nonempty(cmd.name, 40);
      nonempty(cmd.partner, 40);
      return log(
        {
          ...s,
          onboarded: true,
          myRole: cmd.role,
          viewRole: cmd.role,
          names:
            cmd.role === "dom"
              ? { dom: cmd.name.trim(), sub: cmd.partner.trim() }
              : { sub: cmd.name.trim(), dom: cmd.partner.trim() },
        },
        "Local demo set up. Both perspectives are previews, not separate authenticated users.",
      );
    }
    case "reset":
      return cmd.initial;
    case "invite":
      return { ...s, space: { ...s.space, inviteCode: cmd.code } };
    case "routine.save": {
      validateRoutine(cmd.routine);
      const old = s.routines.find((r) => r.id === cmd.routine.id);
      const r = {
        ...cmd.routine,
        title: cmd.routine.title.trim(),
        revision: (old?.revision ?? 0) + 1,
      };
      const proofChanged = old
        ? (old.proof ?? "text") !== (r.proof ?? "text")
        : r.proof === "challenge";
      return log(
        {
          ...s,
          challenge: undefined,
          routines: old ? s.routines.map((x) => (x.id === r.id ? r : x)) : [...s.routines, r],
          agreement: proofChanged ? { ...s.agreement, ack: { dom: null, sub: null } } : s.agreement,
        },
        `${old ? "Edited" : "Assigned"} routine “${r.title}”.${proofChanged ? " Proof policy changed; both must re-acknowledge." : ""}`,
      );
    }
    case "routine.delete": {
      const r = routine(cmd.id);
      requireThat(
        !(s.submissions ?? []).some((x) => x.routineId === r.id && x.status === "open"),
        "Review pending submissions before deleting this routine.",
      );
      return log(
        { ...s, challenge: undefined, routines: s.routines.filter((x) => x.id !== r.id) },
        `Deleted routine “${r.title}”. Submission history retained.`,
      );
    }
    case "goal.save": {
      const g = cmd.goal;
      nonempty(g.id, 100);
      nonempty(g.title, 60);
      nonempty(g.criteria, 500);
      requireThat(g.instructions.length <= 500, "Instructions are too long.");
      requireThat(validDate(g.dueDate), "Choose a valid review date.");
      requireThat(
        ["personal", "wellbeing", "work", "relationship"].includes(g.category) &&
          ["active", "completed", "archived"].includes(g.status),
        "Invalid goal settings.",
      );
      const exists = (s.goals ?? []).some((x) => x.id === g.id);
      return log(
        {
          ...s,
          goals: exists
            ? (s.goals ?? []).map((x) => (x.id === g.id ? g : x))
            : [...(s.goals ?? []), g],
        },
        `${exists ? "Updated" : "Assigned"} goal “${g.title}” · ${g.status}.`,
      );
    }
    case "task.prepare": {
      const r = task(cmd.id),
        key = taskKey(r.id, today),
        prev = s.tasks[key];
      requireThat(
        !prev || ["pending", "clarification", "extension", "revision"].includes(prev.status),
        "This task cannot be changed in its current state.",
      );
      requireThat(
        cmd.preparation !== "decline" || r.optInDaily,
        "Use a permission request for a non-optional routine.",
      );
      return log(
        {
          ...s,
          tasks: {
            ...s.tasks,
            [key]: {
              ...prev,
              status: cmd.preparation === "decline" ? "skipped" : "pending",
              optedIn: cmd.preparation === "optIn" ? true : (prev?.optedIn ?? false),
              acknowledged:
                cmd.preparation === "acknowledge"
                  ? true
                  : !!(prev?.acknowledged && prev.routineRevision === (r.revision ?? 1)),
              routineRevision: r.revision ?? 1,
              updatedAt: at,
              by,
            },
          },
        },
        `${cmd.preparation === "decline" ? "Declined optional routine" : cmd.preparation === "optIn" ? "Opted in" : "Acknowledged instructions"}: “${r.title}”.`,
      );
    }
    case "task.excuse": {
      const r = task(cmd.id),
        key = taskKey(r.id, today),
        prev = s.tasks[key];
      requireThat(
        !prev || ["pending", "revision", "clarification", "extension"].includes(prev.status),
        "Review submitted work in Proof review.",
      );
      return log(
        { ...s, tasks: { ...s.tasks, [key]: { ...prev, status: "excused", by, updatedAt: at } } },
        `Excused “${r.title}” for today.`,
      );
    }
    case "challenge": {
      const r = task(cmd.id);
      requireThat(r.proof === "challenge", "This task does not use a neutral prompt.");
      const words = ["Cedar", "Harbor", "Willow", "Amber", "Maple", "River"];
      return {
        ...s,
        challenge: {
          id: ctx.id(),
          routineId: r.id,
          date: today,
          expiresAt: ctx.now.valueOf() + 60000,
          prompt: `${words[ctx.random() % words.length]} ${10 + (ctx.random() % 90)}`,
        },
      };
    }
    case "submission": {
      const r = task(cmd.id),
        key = taskKey(r.id, today),
        prev = s.tasks[key],
        proof = r.proof ?? "text";
      requireThat(
        !prev || ["pending", "clarification", "extension", "revision"].includes(prev.status),
        "This task already has a final state or a submission awaiting review.",
      );
      requireThat(!r.optInDaily || prev?.optedIn, "Opt in before submitting.");
      requireThat(
        !r.requiresAck || (prev?.acknowledged && prev.routineRevision === (r.revision ?? 1)),
        "Acknowledge the latest instructions before submitting.",
      );
      if (proof !== "confirmation") nonempty(cmd.text, 1000);
      requireThat(cmd.text.length <= 1000, "Check-in is too long.");
      const challenge = s.challenge;
      if (proof === "challenge")
        requireThat(
          challenge &&
            challenge.id === cmd.challengeId &&
            challenge.routineId === r.id &&
            challenge.date === today &&
            ctx.now.valueOf() < challenge.expiresAt &&
            cmd.text.toLowerCase().includes(challenge.prompt.toLowerCase()),
          "Generate a fresh prompt and include it in your response within 60 seconds.",
        );
      const entry: Submission = {
        id: ctx.id(),
        routineId: r.id,
        routineTitle: r.title,
        instructions: r.instructions,
        routineRevision: r.revision ?? 1,
        date: today,
        text: cmd.text.trim(),
        proof,
        at,
        status: "open",
        ...(proof === "challenge" && challenge ? { challengePrompt: challenge.prompt } : {}),
      };
      return log(
        {
          ...s,
          challenge: undefined,
          submissions: [entry, ...(s.submissions ?? [])],
          tasks: { ...s.tasks, [key]: { ...prev, status: "submitted", updatedAt: at, by } },
        },
        `Submitted “${r.title}” for Master review. Text evidence only; task completion is not independently verified.`,
      );
    }
    case "review": {
      const entry = (s.submissions ?? []).find((x) => x.id === cmd.id);
      requireThat(
        entry?.status === "open",
        "Submission has already been reviewed or does not exist.",
      );
      requireThat(
        ["accepted", "revision", "rejected"].includes(cmd.decision),
        "Invalid review decision.",
      );
      requireThat(cmd.response.length <= 500, "Response is too long.");
      if (cmd.decision !== "accepted") nonempty(cmd.response, 500);
      const key = taskKey(entry.routineId, entry.date);
      return log(
        {
          ...s,
          submissions: (s.submissions ?? []).map((x) =>
            x.id === entry.id
              ? { ...x, status: cmd.decision, response: cmd.response.trim(), reviewedAt: at }
              : x,
          ),
          tasks: {
            ...s.tasks,
            [key]: {
              ...s.tasks[key],
              status: cmd.decision === "accepted" ? "completed" : "revision",
              note: cmd.response.trim(),
              updatedAt: at,
              by,
            },
          },
        },
        `Reviewed “${entry.routineTitle}”: ${cmd.decision}${cmd.response.trim() ? ` — ${cmd.response.trim()}` : ""}.`,
      );
    }
    case "request": {
      const q = cmd.request;
      requireThat(
        ["illness", "extension", "permission", "routine_change", "skip"].includes(q.kind),
        "Invalid request kind.",
      );
      requireThat(q.date === today, "Requests must be for today.");
      requireThat(q.note.length <= 500, "Note is too long.");
      if (q.routineId) routine(q.routineId);
      if (["extension", "skip", "routine_change"].includes(q.kind))
        requireThat(q.routineId, "Select a routine.");
      if (q.kind === "extension") {
        const r = task(q.routineId!);
        requireThat(
          q.returnAt &&
            time(q.returnAt) &&
            minutesOf(q.returnAt) >
              minutesOf(s.tasks[taskKey(r.id, today)]?.dueTimeOverride || r.dueTime || r.windowEnd),
          "Choose a new same-day time after the current deadline.",
        );
      }
      requireThat(
        !s.requests.some(
          (x) =>
            x.status === "open" &&
            x.kind === q.kind &&
            x.routineId === q.routineId &&
            x.date === today,
        ),
        "A matching request is already open.",
      );
      return log(
        { ...s, requests: [{ ...q, id: ctx.id(), at, by, status: "open" }, ...s.requests] },
        `Submitted ${q.kind.replace("_", " ")} request.`,
      );
    }
    case "request.resolve": {
      const q = s.requests.find((x) => x.id === cmd.id);
      requireThat(q?.status === "open", "This request is already resolved or missing.");
      requireThat(cmd.response.length <= 500, "Response is too long.");
      if (!cmd.accept) nonempty(cmd.response, 500);
      let tasks = s.tasks;
      if (cmd.accept && ["illness", "skip", "extension"].includes(q.kind)) {
        tasks = { ...tasks };
        for (const r of s.routines.filter(
          (r) => occursOn(r, q.date) && (!q.routineId || q.routineId === r.id),
        )) {
          const key = taskKey(r.id, q.date),
            prev = tasks[key];
          if (prev && !["pending", "clarification", "extension", "revision"].includes(prev.status))
            continue;
          tasks[key] = {
            ...prev,
            status: q.kind === "extension" ? "pending" : q.kind === "skip" ? "skipped" : "excused",
            ...(q.kind === "extension" && q.returnAt ? { dueTimeOverride: q.returnAt } : {}),
            updatedAt: at,
            by,
          };
        }
      }
      return log(
        {
          ...s,
          tasks,
          requests: s.requests.map((x) =>
            x.id === q.id
              ? {
                  ...x,
                  status: cmd.accept ? "accepted" : "declined",
                  response: cmd.response.trim(),
                }
              : x,
          ),
        },
        `${cmd.accept ? "Approved" : "Declined"} ${q.kind.replace("_", " ")} request${cmd.response.trim() ? ` — ${cmd.response.trim()}` : ""}.${q.kind === "routine_change" && cmd.accept ? " Approval recorded; Master must apply the edit in Routines." : ""}`,
      );
    }
    case "pause": {
      requireThat(!s.pause.active, "Already paused.");
      requireThat(cmd.reason.length <= 300, "Pause note is too long.");
      return log(
        {
          ...s,
          challenge: undefined,
          pause: {
            active: true,
            by,
            at,
            reason: cmd.reason.trim(),
            sessionId: ctx.id(),
            ...(cmd.signal ? { signal: cmd.signal } : {}),
            resumeAck: { dom: false, sub: false },
          },
        },
        cmd.signal === "RED"
          ? "RED: stopped the dynamic immediately. All operational changes are locked."
          : cmd.signal === "YELLOW"
            ? "YELLOW: paused for a check-in. All operational changes are locked."
            : "Paused the dynamic. All operational changes are locked.",
      );
    }
    case "message": {
      nonempty(cmd.text, 1000);
      requireThat(cmd.channel === "notes" || cmd.channel === "discussion", "Invalid channel.");
      requireThat(
        cmd.channel !== "discussion" || s.pause.active,
        "Pause discussion is available during a pause.",
      );
      if (cmd.routineId) routine(cmd.routineId);
      return {
        ...s,
        pause:
          cmd.channel === "discussion"
            ? { ...s.pause, resumeAck: { dom: false, sub: false } }
            : s.pause,
        messages: [
          ...s.messages,
          {
            id: ctx.id(),
            at,
            by,
            text: cmd.text.trim(),
            channel: cmd.channel,
            ...(cmd.routineId ? { routineId: cmd.routineId } : {}),
            ...(cmd.channel === "discussion" ? { pauseSession: s.pause.sessionId } : {}),
          },
        ],
      };
    }
    case "resume": {
      requireThat(s.pause.active, "The dynamic is not paused.");
      requireThat(s.pause.sessionId, "A discussion is required before resuming.");
      for (const role of ["dom", "sub"] as const)
        requireThat(
          s.messages.some(
            (x) =>
              x.channel === "discussion" && x.pauseSession === s.pause.sessionId && x.by === role,
          ),
          "Both people must contribute to the current discussion before acknowledging readiness.",
        );
      requireThat(!s.pause.resumeAck[by], "You have already acknowledged readiness.");
      const resumeAck = { ...s.pause.resumeAck, [by]: true };
      return log(
        {
          ...s,
          pause:
            resumeAck.dom && resumeAck.sub
              ? { active: false, resumeAck: { dom: false, sub: false } }
              : { ...s.pause, resumeAck },
        },
        resumeAck.dom && resumeAck.sub
          ? "Both acknowledged after discussion. Dynamic resumed."
          : "Ready to resume; waiting for partner.",
      );
    }
    case "agreement.ack":
      return log(
        {
          ...s,
          agreement: { ...s.agreement, ack: { ...s.agreement.ack, [by]: at }, lastReview: today },
        },
        "Acknowledged the current agreement.",
      );
    case "agreement.propose": {
      nonempty(cmd.text, 300);
      requireThat(
        ["Boundaries", "Excluded activities", "Communication windows"].includes(cmd.section),
        "Choose a valid agreement section.",
      );
      return log(
        {
          ...s,
          agreement: {
            ...s.agreement,
            proposals: [
              { id: ctx.id(), at, by, section: cmd.section, text: cmd.text.trim(), status: "open" },
              ...s.agreement.proposals,
            ],
          },
        },
        `Proposed an agreement change: ${cmd.section}.`,
      );
    }
    case "agreement.resolve": {
      const p = s.agreement.proposals.find((x) => x.id === cmd.id);
      requireThat(
        p?.status === "open" && p.by !== by,
        "Only the other person can resolve an open proposal.",
      );
      const a = {
        ...s.agreement,
        proposals: s.agreement.proposals.map((x) =>
          x.id === p.id
            ? { ...x, status: cmd.accept ? ("accepted" as const) : ("declined" as const) }
            : x,
        ),
      };
      if (cmd.accept) {
        if (p.section === "Boundaries") a.boundaries = [...a.boundaries, p.text];
        if (p.section === "Excluded activities") a.excluded = [...a.excluded, p.text];
        if (p.section === "Communication windows") a.commWindows = p.text;
        a.ack = { dom: null, sub: null };
      }
      return log(
        { ...s, agreement: a, challenge: undefined },
        `${cmd.accept ? "Accepted" : "Declined"} agreement proposal.${cmd.accept ? " Both must re-acknowledge." : ""}`,
      );
    }
    case "prefs": {
      requireThat(
        (!cmd.patch.quietStart || time(cmd.patch.quietStart)) &&
          (!cmd.patch.quietEnd || time(cmd.patch.quietEnd)),
        "Choose valid quiet-hour times.",
      );
      return { ...s, prefs: { ...s.prefs, ...cmd.patch } };
    }
  }
}
