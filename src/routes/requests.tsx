import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { RequestDialog, REQUEST_LABEL } from "@/components/nocturne/RequestDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uiActions as actions, useNocturne } from "@/lib/nocturne/store";
import type { PartnerRequest } from "@/lib/nocturne/types";

export const Route = createFileRoute("/requests")({
  head: () => ({ meta: [{ title: "Requests — BoundSome" }] }),
  component: RequestsPage,
});
function RequestsPage() {
  const s = useNocturne(),
    [tab, setTab] = useState<"open" | "history">("open"),
    entries = s.requests.filter((x) =>
      tab === "open" ? x.status === "open" : x.status !== "open",
    );
  return (
    <AppShell
      eyebrow="Ask, consider, respond"
      title="Permission requests"
      readControls={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === "open" ? "secondary" : "ghost"}
            onClick={() => setTab("open")}
          >
            Open ({s.requests.filter((x) => x.status === "open").length})
          </Button>
          <Button
            size="sm"
            variant={tab === "history" ? "secondary" : "ghost"}
            onClick={() => setTab("history")}
          >
            History
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          {s.viewRole === "dom"
            ? "Review requests here. Routine edits remain in Routines, so every decision has one clear home."
            : "Ask for permission or a change. You do not directly edit assigned goals or routines. For a routine-specific request, open that routine."}
        </p>
        {s.viewRole === "sub" && (
          <RequestDialog kind="permission" trigger={<Button>Ask permission</Button>} />
        )}
      </div>
      {!entries.length && (
        <p className="py-12 text-center font-display text-2xl italic text-muted-foreground">
          No {tab === "open" ? "open requests" : "decisions yet"}.
        </p>
      )}
      <ul className="mt-6 space-y-4">
        {entries.map((q) => (
          <RequestCard key={q.id} request={q} />
        ))}
      </ul>
    </AppShell>
  );
}
function RequestCard({ request: q }: { request: PartnerRequest }) {
  const s = useNocturne(),
    [response, setResponse] = useState(""),
    routine = s.routines.find((r) => r.id === q.routineId);
  return (
    <li className="surface p-5">
      <p className="eyebrow">
        {q.date} · {q.status}
      </p>
      <h2 className="mt-2 text-2xl">{REQUEST_LABEL[q.kind]}</h2>
      {routine && <p className="mt-1 text-sm text-gold">{routine.title}</p>}
      <p className="mt-3 text-xs text-muted-foreground">
        {s.names[q.by]} · {new Date(q.at).toLocaleString()}
        {q.reason ? ` · ${q.reason.replace("_", " / ")}` : ""}
        {q.returnAt ? ` · requested time ${q.returnAt}` : ""}
      </p>
      {q.note && <p className="mt-4 whitespace-pre-wrap text-sm leading-6">“{q.note}”</p>}
      {q.status === "open" && s.viewRole === "dom" && (
        <div className="mt-5">
          <Label htmlFor={`request-response-${q.id}`}>
            Decision note (required when declining)
          </Label>
          <Textarea
            id={`request-response-${q.id}`}
            className="my-3"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            maxLength={500}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                if ((await actions.respondRequest(q.id, true, response.trim())).ok)
                  toast.success("Request approved");
              }}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!response.trim()}
              onClick={async () => {
                if ((await actions.respondRequest(q.id, false, response.trim())).ok)
                  toast("Decision recorded");
              }}
            >
              Decline with explanation
            </Button>
          </div>
          {q.kind === "routine_change" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Approval records permission. Apply the actual edit in Routines.
            </p>
          )}
        </div>
      )}
      {q.response && <p className="mt-4 border-t pt-3 text-sm">Master response: {q.response}</p>}
    </li>
  );
}
