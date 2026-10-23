import { STATUS_LABEL, type TaskStatus } from "@/lib/nocturne/types";

const TONE: Record<TaskStatus, string> = {
  pending: "border-border text-muted-foreground",
  submitted: "border-gold/50 text-gold",
  revision: "border-warning/50 text-warning",
  completed: "border-success/50 text-success",
  clarification: "border-warning/50 text-warning",
  extension: "border-gold/50 text-gold",
  excused: "border-gold/40 text-gold",
  skipped: "border-border text-muted-foreground",
  paused: "border-wine text-ivory",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.7rem] ${TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
