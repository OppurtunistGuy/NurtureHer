// One dashboard card per relationship. Built on the server from a single space's state,
// so a card never carries anything from another relationship.
import { dateKey, effectiveStatus, occursOn, taskKey } from "./logic";
import { pointsSummary } from "./points";
import type { AppState, Role } from "./types";

export type DashboardCard = {
  id: string;
  /** The signed-in person's role in this relationship. */
  myRole: Role;
  partnerName: string;
  paired: boolean;
  paused: boolean;
  pauseSignal: "RED" | "YELLOW" | null;
  today: { completed: number; pending: number; notPerformed: number; total: number };
  pendingReview: number;
  latestCheckIn: { title: string; at: string } | null;
  rewards: number;
  outstandingPunishment: number;
  level: string;
  agreement: "acknowledged" | "waiting" | "update-pending";
  /** Only for the person who created an unused invitation. */
  invite: { token: string; expiresAt: number } | null;
};

const NOT_PENDING = new Set(["completed", "excused", "skipped", "not_performed"]);

export function summarizeSpace(
  spaceId: string,
  state: AppState,
  myRole: Role,
  now: Date,
  invite: DashboardCard["invite"],
): DashboardCard {
  const date = dateKey(now, state.space.timeZone);
  const statuses = state.routines
    .filter((routine) => occursOn(routine, date))
    .map((routine) => effectiveStatus(state.tasks[taskKey(routine.id, date)], state.pause.active));
  const submissions = state.submissions ?? [];
  const latest = submissions.reduce<(typeof submissions)[number] | undefined>(
    (best, item) => (!best || item.at > best.at ? item : best),
    undefined,
  );
  const points = pointsSummary(state);
  const acked = !!(state.agreement.ack.dom && state.agreement.ack.sub);
  return {
    id: spaceId,
    myRole,
    partnerName: state.names[myRole === "dom" ? "sub" : "dom"],
    paired: state.space.paired,
    paused: state.pause.active,
    pauseSignal: state.pause.active ? (state.pause.signal ?? null) : null,
    today: {
      completed: statuses.filter((status) => status === "completed").length,
      pending: statuses.filter((status) => !NOT_PENDING.has(status)).length,
      notPerformed: statuses.filter((status) => status === "not_performed").length,
      total: statuses.length,
    },
    pendingReview: submissions.filter((item) => item.status === "open").length,
    latestCheckIn: latest ? { title: latest.routineTitle, at: latest.at } : null,
    rewards: points.rewards,
    outstandingPunishment: points.outstanding,
    level: points.level.label,
    agreement: state.agreementUpdatePending ? "update-pending" : acked ? "acknowledged" : "waiting",
    invite: state.space.paired ? null : invite,
  };
}

export type DashboardFilter = "all" | "review" | "paused" | "agreement" | "waiting";

export function matchesFilter(card: DashboardCard, filter: DashboardFilter) {
  if (filter === "review") return card.pendingReview > 0;
  if (filter === "paused") return card.paused;
  if (filter === "agreement") return card.paired && card.agreement !== "acknowledged";
  if (filter === "waiting") return !card.paired;
  return true;
}
