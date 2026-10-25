import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uiActions as actions, useNocturne } from "@/lib/nocturne/store";
import { agreementReady } from "@/lib/nocturne/engine";
import { uid } from "@/lib/nocturne/logic";
import { pointsSummary, pointsLevelsSchema, type PointsLevel } from "@/lib/nocturne/points";
import { useUnsavedChanges } from "@/lib/nocturne/unsaved";
import { useProfile, useSubName } from "@/lib/nocturne/profile";

export const Route = createFileRoute("/points")({
  head: () => ({ meta: [{ title: "Points & milestones — BoundSome" }] }),
  component: PointsPage,
});

function PointsPage() {
  const s = useNocturne(),
    summary = pointsSummary(s);
  const master = s.viewRole === "dom";
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"reward" | "punishment">("reward");
  const [amount, setAmount] = useState("10"),
    [reason, setReason] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [adjustment, setAdjustment] = useState<{ id: string; action: "void" | "resolve" } | null>(
    null,
  );
  const [note, setNote] = useState("");
  const profile = useProfile(),
    subName = useSubName();
  useUnsavedChanges(!!reason.trim(), "a points entry");
  useUnsavedChanges(!!note.trim(), "a points correction");
  // In a Sub's profile, levels and milestones have their own section.
  const levelsOnly = profile?.section === "levels",
    showLevels = !profile || levelsOnly,
    showLedger = !levelsOnly;
  const allowed = master && agreementReady(s) && !s.pause.active && !busy;
  const accepted = (s.submissions ?? []).filter(
    (item) =>
      item.status === "accepted" &&
      !summary.ledger.some((entry) => entry.submissionId === item.id && !entry.voidedAt),
  );

  async function award(event: FormEvent) {
    event.preventDefault();
    if (!allowed) return;
    setBusy(true);
    try {
      const result = await actions.awardPoints({
        id: uid(),
        kind,
        amount: Number(amount),
        reason: reason.trim(),
        ...(kind === "reward" && submissionId ? { submissionId } : {}),
      });
      if (result.ok) {
        setReason("");
        setSubmissionId("");
        toast.success("Points recorded");
      }
    } finally {
      setBusy(false);
    }
  }
  async function adjust(event: FormEvent) {
    event.preventDefault();
    if (!allowed || !adjustment || !note.trim()) return;
    setBusy(true);
    try {
      const result = await actions.adjustPoints(adjustment.id, adjustment.action, note.trim());
      if (result.ok) {
        setAdjustment(null);
        setNote("");
        toast.success("Points history updated");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell
      eyebrow="Recognise effort. Review fairly."
      title={levelsOnly ? "Levels and milestones" : profile ? "Points" : "Points & milestones"}
    >
      <p className="mb-6 text-sm leading-6 text-muted-foreground">
        Each space has its own points history. Rewards build progress; punishment points record a
        reviewed accountability concern. Neither triggers a physical consequence, restriction, or
        automatic escalation. Safety signals, limits and withdrawal of consent never earn punishment
        points.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="surface p-5">
          <p className="text-xs text-muted-foreground">Reward points</p>
          <p className="mt-2 text-4xl text-gold">{summary.rewards}</p>
          <p className="mt-1 text-sm">{summary.level.label}</p>
        </div>
        <div className="surface p-5">
          <p className="text-xs text-muted-foreground">Punishment points · outstanding</p>
          <p className="mt-2 text-4xl">{summary.outstanding}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.totalPunishment} recorded overall · rewards stay separate
          </p>
        </div>
      </div>
      <section className="my-7" aria-label="Level progress">
        <div className="mb-2 flex justify-between gap-3 text-sm">
          <span>{summary.level.label}</span>
          <span>
            {summary.next
              ? `${summary.next.threshold - summary.rewards} to ${summary.next.label}`
              : "Highest configured level reached"}
          </span>
        </div>
        <progress
          className="h-2 w-full accent-primary"
          value={summary.progress}
          max={100}
          aria-label="Progress to next reward level"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Progress uses reward points only. Resolving accountability does not spend your rewards.
        </p>
      </section>
      <section aria-label="Milestones" className={`space-y-3 ${showLevels ? "" : "hidden"}`}>
        <h2 className="text-2xl">Levels & milestones</h2>
        {summary.levels.map((level) => (
          <div key={level.threshold} className="flex gap-4 border-b py-3">
            <span className="min-w-12 text-gold">{level.threshold}</span>
            <div>
              <p>
                {level.label}{" "}
                <span className="text-xs text-muted-foreground">
                  · {summary.rewards >= level.threshold ? "Reached" : "Ahead"}
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{level.milestone}</p>
            </div>
          </div>
        ))}
      </section>
      {!agreementReady(s) && (
        <p role="status" className="mt-6 text-sm text-gold">
          Both people must acknowledge the agreement before points can be recorded.
        </p>
      )}
      {master && (
        <>
          <form
            onSubmit={award}
            className={`surface my-8 space-y-4 p-5 ${showLedger ? "" : "hidden"}`}
          >
            <h2 className="text-2xl">Record points</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              Suggested rewards: thoughtful check-in +5, accepted routine +10, weekly reflection
              +20. For a concern, discuss context first and record only agreed accountability. A
              missed task alone adds nothing.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="points-kind">Point type</Label>
                <select
                  id="points-kind"
                  className="native-select mt-2 w-full"
                  disabled={!allowed}
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as typeof kind);
                    setSubmissionId("");
                  }}
                >
                  <option value="reward">Reward</option>
                  <option value="punishment">Punishment</option>
                </select>
              </div>
              <div>
                <Label htmlFor="points-amount">Points (1–100)</Label>
                <Input
                  id="points-amount"
                  className="mt-2"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={amount}
                  required
                  disabled={!allowed}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            {kind === "reward" && (
              <div>
                <Label htmlFor="points-submission">Link an accepted check-in (optional)</Label>
                <select
                  id="points-submission"
                  className="native-select mt-2 w-full"
                  disabled={!allowed}
                  value={submissionId}
                  onChange={(e) => setSubmissionId(e.target.value)}
                >
                  <option value="">General recognition</option>
                  {accepted.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.date} · {item.routineTitle}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label htmlFor="points-reason">Reason visible to both people</Label>
              <Textarea
                id="points-reason"
                className="mt-2"
                value={reason}
                maxLength={500}
                required
                disabled={!allowed}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button disabled={!allowed || !reason.trim()} type="submit">
              {busy ? "Saving…" : subName ? `Record for ${subName}` : "Record points"}
            </Button>
          </form>
          {showLevels && (
            <LevelEditor
              key={s.space.id ?? "demo"}
              initial={summary.levels}
              disabled={!allowed}
              open={levelsOnly}
            />
          )}
        </>
      )}
      {!master && (
        <p className="my-6 text-sm text-muted-foreground">
          Your Master records and reviews entries. Use Notes or a permission request to discuss an
          entry or ask for a correction.
        </p>
      )}
      <section className={`mt-8 ${showLedger ? "" : "hidden"}`} aria-label="Points history">
        <h2 className="text-2xl">Points history</h2>
        {!summary.ledger.length && (
          <p className="py-6 text-sm text-muted-foreground">
            No entries yet. Nothing is awarded or deducted automatically.
          </p>
        )}
        {summary.ledger.map((entry) => (
          <article key={entry.id} className="border-b py-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={entry.kind === "reward" ? "text-gold" : ""}>
                {entry.kind === "reward" ? "+" : ""}
                {entry.amount} {entry.kind} points
              </p>
              <span className="text-xs text-muted-foreground">
                {entry.voidedAt
                  ? "Reversed"
                  : entry.resolvedAt
                    ? "Resolved"
                    : entry.kind === "reward"
                      ? "Awarded"
                      : "Outstanding"}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{entry.reason}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {s.names.dom} · {new Date(entry.at).toLocaleString()}
            </p>
            {entry.resolution && (
              <p className="mt-2 text-sm text-muted-foreground">Resolution: {entry.resolution}</p>
            )}
            {entry.voidReason && (
              <p className="mt-2 text-sm text-muted-foreground">Reversal: {entry.voidReason}</p>
            )}
            {master && !entry.voidedAt && (
              <div className="mt-3 flex gap-2">
                {entry.kind === "punishment" && !entry.resolvedAt && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!allowed}
                    onClick={() => {
                      setAdjustment({ id: entry.id, action: "resolve" });
                      setNote("");
                    }}
                  >
                    Resolve
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!allowed}
                  onClick={() => {
                    setAdjustment({ id: entry.id, action: "void" });
                    setNote("");
                  }}
                >
                  Reverse entry
                </Button>
              </div>
            )}
            {adjustment?.id === entry.id && (
              <form onSubmit={adjust} className="mt-4 space-y-3">
                <Label htmlFor="point-adjust-note">
                  {adjustment.action === "void"
                    ? "Why reverse this entry?"
                    : "How was this resolved?"}
                </Label>
                <Textarea
                  id="point-adjust-note"
                  value={note}
                  maxLength={500}
                  required
                  disabled={!allowed}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={!allowed || !note.trim()}>
                    Confirm {adjustment.action === "void" ? "reversal" : "resolution"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAdjustment(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </article>
        ))}
      </section>
    </AppShell>
  );
}

function LevelEditor({
  initial,
  disabled,
  open = false,
}: {
  initial: PointsLevel[];
  disabled: boolean;
  open?: boolean;
}) {
  const [levels, setLevels] = useState(initial.map((item) => ({ ...item })));
  useUnsavedChanges(JSON.stringify(levels) !== JSON.stringify(initial), "levels and milestones");
  const subName = useSubName();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function patch(index: number, change: Partial<PointsLevel>) {
    setLevels((old) => old.map((item, i) => (i === index ? { ...item, ...change } : item)));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (disabled || busy) return;
    const parsed = pointsLevelsSchema.safeParse(levels);
    if (!parsed.success) {
      setError(
        "Use 1–10 levels, start at zero, use increasing whole-number thresholds, and fill in each label and milestone.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await actions.savePointLevels(parsed.data);
      if (result.ok) toast.success("Levels and milestones saved");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border p-4" open={open}>
      <summary className="cursor-pointer text-sm">Customise level labels & milestones</summary>
      <form onSubmit={save} className="mt-4 space-y-5">
        <p className="text-xs text-muted-foreground">
          Thresholds use total reward points. Updating them may change the displayed level; the
          points history stays intact.
        </p>
        {levels.map((level, index) => (
          <fieldset className="space-y-2" key={index} disabled={disabled || busy}>
            <legend className="mb-2 text-sm">Level {index + 1}</legend>
            <Label htmlFor={`threshold-${index}`}>Reward points required</Label>
            <Input
              id={`threshold-${index}`}
              type="number"
              min={0}
              max={1000000}
              step={1}
              value={level.threshold}
              onChange={(e) => patch(index, { threshold: Number(e.target.value) })}
              required
            />
            <Label htmlFor={`level-label-${index}`}>Label</Label>
            <Input
              id={`level-label-${index}`}
              maxLength={50}
              value={level.label}
              onChange={(e) => patch(index, { label: e.target.value })}
              required
            />
            <Label htmlFor={`milestone-${index}`}>Milestone</Label>
            <Input
              id={`milestone-${index}`}
              maxLength={200}
              value={level.milestone}
              onChange={(e) => patch(index, { milestone: e.target.value })}
              required
            />
            {levels.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLevels((old) => old.filter((_, i) => i !== index))}
              >
                Remove level
              </Button>
            )}
          </fieldset>
        ))}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={disabled || busy} type="submit">
            {subName ? `Save levels for ${subName}` : "Save levels"}
          </Button>
          <Button
            disabled={disabled || busy || levels.length >= 10}
            variant="outline"
            type="button"
            onClick={() =>
              setLevels((old) => [
                ...old,
                {
                  threshold: (old[old.length - 1]?.threshold ?? 0) + 100,
                  label: "Next chapter",
                  milestone: "Choose the next milestone together.",
                },
              ])
            }
          >
            Add level
          </Button>
        </div>
      </form>
    </details>
  );
}
