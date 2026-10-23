import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { actions, useNocturne } from "@/lib/nocturne/store";
import type { Submission } from "@/lib/nocturne/types";

export const Route = createFileRoute("/proof")({
  head: () => ({ meta: [{ title: "Proof review — Nocturne" }] }),
  component: ProofPage,
});
function ProofPage() {
  const s = useNocturne(),
    [tab, setTab] = useState<"open" | "history">("open"),
    entries = (s.submissions ?? []).filter((x) =>
      tab === "open" ? x.status === "open" : x.status !== "open",
    );
  return (
    <AppShell
      eyebrow="Evidence, not assumptions"
      title={s.viewRole === "dom" ? "Proof review" : "My submissions"}
      readControls={
        <div className="flex gap-2">
          <Button
            variant={tab === "open" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTab("open")}
          >
            Awaiting review ({(s.submissions ?? []).filter((x) => x.status === "open").length})
          </Button>
          <Button
            variant={tab === "history" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTab("history")}
          >
            History
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-muted-foreground">
        {s.viewRole === "dom"
          ? "Read each check-in against the assigned instructions. Your decision—not an automated score—closes the task."
          : "Submitting sends work for review. Only Master acceptance completes the task."}
      </p>
      {!entries.length && (
        <p className="py-12 text-center font-display text-2xl italic text-muted-foreground">
          {tab === "open" ? "No check-ins awaiting review." : "No review decisions yet."}
        </p>
      )}
      <ul className="mt-6 space-y-5">
        {entries.map((x) => (
          <ReviewCard key={x.id} entry={x} />
        ))}
      </ul>
      <div className="mt-9 border-t pt-5">
        <h2 className="text-xl">Media & live verification</h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          Not available in this build. No camera opens, no media is uploaded, and no biometric or
          liveness result is generated. Neutral text prompts are replay-deterrence aids only; they
          do not establish who responded or whether a task was performed. Browser screenshots and
          external photographs cannot be prevented.
        </p>
        <Button variant="outline" className="mt-3" disabled>
          Camera verification · unsupported
        </Button>
      </div>
    </AppShell>
  );
}
function ReviewCard({ entry: x }: { entry: Submission }) {
  const s = useNocturne(),
    [response, setResponse] = useState("");
  const decide = (decision: "accepted" | "revision" | "rejected") => {
    if (actions.review(x.id, decision, response.trim()).ok)
      toast.success("Review decision recorded");
  };
  return (
    <li className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">
          {x.date} ·{" "}
          {x.proof === "challenge"
            ? "Neutral prompt response"
            : x.proof === "confirmation"
              ? "Self-confirmation"
              : "Written check-in"}
        </p>
        <span className={`text-xs ${x.status === "accepted" ? "text-success" : "text-gold"}`}>
          {x.status === "open"
            ? "Awaiting review"
            : x.status === "revision"
              ? "Clarification requested"
              : x.status}
        </span>
      </div>
      <h2 className="mt-3 text-2xl">{x.routineTitle}</h2>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          Assigned instructions · version {x.routineRevision}
        </summary>
        <p className="mt-2 whitespace-pre-wrap leading-6">
          {x.instructions || "No additional instructions."}
        </p>
      </details>
      <blockquote className="my-4 whitespace-pre-wrap border-l-2 border-wine pl-4 text-sm leading-6">
        {x.text || "Completion self-confirmed. No written evidence attached."}
      </blockquote>
      {x.challengePrompt && (
        <p className="mb-3 font-mono text-xs text-gold">
          Prompt: {x.challengePrompt} · matched text only
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Submitted {new Date(x.at).toLocaleString()} · no media retained
      </p>
      {x.status === "open" && s.viewRole === "dom" && (
        <div className="mt-5 border-t pt-4">
          <Label htmlFor={`response-${x.id}`}>
            Feedback (required for clarification or rejection)
          </Label>
          <Textarea
            id={`response-${x.id}`}
            className="my-3"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            maxLength={500}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => decide("accepted")}>
              Accept check-in
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!response.trim()}
              onClick={() => decide("revision")}
            >
              Ask for clarification
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!response.trim()}
              onClick={() => decide("rejected")}
            >
              Reject submission
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Rejection permits a new check-in. It never triggers a punishment.
          </p>
        </div>
      )}
      {x.reviewedAt && (
        <div className="mt-4 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Master decision · {new Date(x.reviewedAt).toLocaleString()}
          </p>
          {x.response && <p className="mt-2 whitespace-pre-wrap text-sm">{x.response}</p>}
        </div>
      )}
    </li>
  );
}
