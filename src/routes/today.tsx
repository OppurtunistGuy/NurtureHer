import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { SpaceConnection } from "@/components/nocturne/SpaceConnection";
import { RequestDialog } from "@/components/nocturne/RequestDialog";
import { SubmissionDialog } from "@/components/nocturne/SubmissionDialog";
import { StatusBadge } from "@/components/nocturne/StatusBadge";
import { Button } from "@/components/ui/button";
import { dateKey, effectiveStatus, isOverdue, occursOn, taskKey } from "@/lib/nocturne/logic";
import { agreementReady } from "@/lib/nocturne/engine";
import { uiActions as actions, useNocturne } from "@/lib/nocturne/store";

export const Route = createFileRoute("/today")({
  head: () => ({ meta: [{ title: "Today — BoundSome" }] }),
  component: TodayPage,
});
function TodayPage() {
  const s = useNocturne(),
    [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const date = dateKey(now, s.space.timeZone),
    dom = s.viewRole === "dom",
    ready = agreementReady(s);
  const items = s.routines
    .filter((r) => occursOn(r, date))
    .sort((a, b) => a.windowStart.localeCompare(b.windowStart))
    .map((r) => {
      const rec = s.tasks[taskKey(r.id, date)],
        status = effectiveStatus(rec, s.pause.active);
      return {
        r,
        rec,
        status,
        overdue: isOverdue(
          { ...r, ...(rec?.dueTimeOverride ? { dueTime: rec.dueTimeOverride } : {}) },
          status,
          now,
          s.space.timeZone,
        ),
      };
    });
  const openProof = (s.submissions ?? []).filter((x) => x.status === "open").length,
    openRequests = s.requests.filter((x) => x.status === "open").length;
  return (
    <AppShell
      eyebrow={now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        ...(s.space.timeZone ? { timeZone: s.space.timeZone } : {}),
      })}
      title={dom ? `Good day, ${s.names.dom}` : `Your routine, ${s.names.sub}`}
    >
      <SpaceConnection />
      {s.agreement.document && (
        <p className="mb-6 border-l-2 border-wine pl-4 text-xs leading-6 text-muted-foreground">
          Agreed sessions remain the focus until December 16, around exams and family commitments.{" "}
          <Link to="/agreements" className="text-gold underline">
            Read our agreement
          </Link>{" "}
          before changing the arrangement.
        </p>
      )}
      {!ready && (
        <div className="mb-7 rounded-md border border-gold/30 bg-gold/5 p-4 text-sm">
          <p>Review the framework before check-ins begin.</p>
          <Link
            to="/agreements"
            className="mt-2 inline-block text-gold underline underline-offset-4"
          >
            Both people must acknowledge the agreement →
          </Link>
        </div>
      )}
      {dom && (
        <>
          <dl className="mb-8 grid grid-cols-3 divide-x border-y py-5 text-center">
            <div>
              <dd className="font-display text-3xl">
                {items.filter((x) => x.status === "completed" && x.rec?.by === "dom").length}/
                {items.length}
              </dd>
              <dt className="eyebrow mt-2 text-[0.55rem]">Accepted today</dt>
            </div>
            <div>
              <dd className="font-display text-3xl text-gold">{openProof}</dd>
              <dt className="eyebrow mt-2 text-[0.55rem]">For review</dt>
            </div>
            <div>
              <dd className="font-display text-3xl">{openRequests}</dd>
              <dt className="eyebrow mt-2 text-[0.55rem]">Requests</dt>
            </div>
          </dl>
          {(openProof > 0 || openRequests > 0) && (
            <div className="mb-8 flex flex-wrap gap-3">
              {openProof > 0 && (
                <Link to="/proof" className="rounded-md border px-4 py-3 text-sm text-gold">
                  Review {openProof} check-in{openProof === 1 ? "" : "s"} →
                </Link>
              )}
              {openRequests > 0 && (
                <Link to="/requests" className="rounded-md border px-4 py-3 text-sm">
                  Open {openRequests} request{openRequests === 1 ? "" : "s"} →
                </Link>
              )}
            </div>
          )}
        </>
      )}
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-2xl">{dom ? "Today's rhythm" : "Assigned for today"}</h2>
        {!dom && (
          <RequestDialog
            kind="illness"
            trigger={
              <Button variant="outline" size="sm">
                Not feeling well
              </Button>
            }
          />
        )}
      </div>
      {!items.length && (
        <p className="py-10 text-center font-display text-xl italic text-muted-foreground">
          A quiet day. Nothing scheduled.
        </p>
      )}
      <ol className="relative space-y-1 border-l pl-6">
        {items.map(({ r, rec, status, overdue }) => {
          const actionable = ["pending", "clarification", "extension", "revision"].includes(status),
            needsOpt = r.optInDaily && !rec?.optedIn,
            needsAck =
              r.requiresAck && (!rec?.acknowledged || rec.routineRevision !== (r.revision ?? 1));
          return (
            <li key={r.id} className="relative pb-7">
              <span
                className={`absolute -left-[1.85rem] top-1.5 h-3 w-3 rotate-45 border ${status === "completed" ? "border-success bg-success" : "border-gold bg-background"}`}
                aria-hidden
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {r.windowStart}–{r.windowEnd}
                  {rec?.dueTimeOverride
                    ? ` · extended to ${rec.dueTimeOverride}`
                    : r.dueTime
                      ? ` · due ${r.dueTime}`
                      : ""}
                </p>
                <StatusBadge status={status} />
              </div>
              <h3 className="mt-2 text-2xl text-ivory">{r.title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{r.instructions}</p>
              {overdue && (
                <p className="mt-2 text-xs text-warning">
                  Past due · for discussion, not an automatic failure
                </p>
              )}
              {rec?.note && (
                <p className="mt-2 border-l border-gold/40 pl-3 text-sm">
                  Master feedback: {rec.note}
                </p>
              )}
              {dom
                ? actionable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={async () => {
                        if ((await actions.excuseTask(r.id)).ok) toast("Excused for today");
                      }}
                    >
                      Excuse today
                    </Button>
                  )
                : actionable && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {needsOpt ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!ready}
                            onClick={() => actions.prepareTask(r.id, "optIn")}
                          >
                            Opt in today
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!ready}
                            onClick={() => actions.prepareTask(r.id, "decline")}
                          >
                            Not today
                          </Button>
                        </>
                      ) : needsAck ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!ready}
                          onClick={() => actions.prepareTask(r.id, "acknowledge")}
                        >
                          Acknowledge instructions
                        </Button>
                      ) : (
                        <SubmissionDialog routine={r} disabled={!ready} />
                      )}
                      <RequestDialog
                        kind="permission"
                        routine={r}
                        trigger={
                          <Button size="sm" variant="ghost">
                            Ask
                          </Button>
                        }
                      />
                      <RequestDialog
                        kind="extension"
                        routine={r}
                        trigger={
                          <Button size="sm" variant="ghost">
                            Extension
                          </Button>
                        }
                      />
                      <RequestDialog
                        kind="skip"
                        routine={r}
                        trigger={
                          <Button size="sm" variant="ghost">
                            Request skip
                          </Button>
                        }
                      />
                    </div>
                  )}
            </li>
          );
        })}
      </ol>
      {dom && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Assign structure in{" "}
          <Link to="/routines" className="text-gold underline">
            Routines
          </Link>{" "}
          and{" "}
          <Link to="/goals" className="text-gold underline">
            Goals
          </Link>
          . Detailed evidence, requests and notes each have their own page.
        </p>
      )}
    </AppShell>
  );
}
