import type { Routine, TaskRecord, TaskStatus } from "./types";

export function dateKey(d: Date = new Date(), timeZone?: string): string {
  if (timeZone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    return ["year", "month", "day"]
      .map((key) => parts.find((part) => part.type === key)!.value)
      .join("-");
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function taskKey(routineId: string, date: string) {
  return `${routineId}:${date}`;
}

export function occursOn(r: Routine, date: string): boolean {
  if (!r.enabled) return false;
  const rec = r.recurrence;
  if (rec.kind === "daily") return true;
  if (rec.kind === "once") return rec.date === date;
  const [y = NaN, m = NaN, d = NaN] = date.split("-").map(Number);
  return rec.days.includes(new Date(y, m - 1, d).getDay());
}

export function minutesOf(hhmm: string): number {
  const [h = NaN, m = NaN] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Effective status. A pause always wins — no task can override it. */
export function effectiveStatus(rec: TaskRecord | undefined, paused: boolean): TaskStatus {
  if (
    paused &&
    (!rec || ["pending", "clarification", "extension", "revision"].includes(rec.status))
  )
    return "paused";
  return rec?.status ?? "pending";
}

/** Minutes on the shared schedule's wall clock. */
export function clockMinutes(now: Date, timeZone?: string): number {
  if (!timeZone) return now.getHours() * 60 + now.getMinutes();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return (
    Number(parts.find((part) => part.type === "hour")!.value) * 60 +
    Number(parts.find((part) => part.type === "minute")!.value)
  );
}
/** Overdue only flags for discussion; it never changes the status. */
export function isOverdue(
  r: Routine,
  status: TaskStatus,
  now: Date = new Date(),
  timeZone?: string,
): boolean {
  if (status !== "pending") return false;
  const end = minutesOf(r.dueTime || r.windowEnd);
  return clockMinutes(now, timeZone) > end;
}

export function recurrenceLabel(r: Routine): string {
  const rec = r.recurrence;
  if (rec.kind === "daily") return "Daily";
  if (rec.kind === "once") return `Once · ${rec.date}`;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return rec.days.length ? rec.days.map((d) => names[d]).join(" ") : "No days";
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomInviteCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export function uid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID requires a secure context; getRandomValues also works on a
  // non-HTTPS internal preview. Preserve RFC 4122 v4 randomness, never Math.random.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
