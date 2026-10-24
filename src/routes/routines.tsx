import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { dateKey, recurrenceLabel, uid } from "@/lib/nocturne/logic";
import { uiActions as actions, useNocturne } from "@/lib/nocturne/store";
import type { Routine } from "@/lib/nocturne/types";
import { RequestDialog } from "@/components/nocturne/RequestDialog";
import { RoutineDraft } from "@/components/nocturne/RoutineDraft";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/routines")({
  head: () => ({
    meta: [
      { title: "Routines — BoundSome" },
      { name: "description", content: "Build and edit recurring routines together." },
      { property: "og:title", content: "Routines — BoundSome" },
      { property: "og:description", content: "Recurring routine builder." },
    ],
  }),
  component: RoutinesPage,
});

const blank = (): Routine => ({
  id: uid(),
  title: "",
  instructions: "",
  windowStart: "08:00",
  windowEnd: "09:00",
  recurrence: { kind: "daily" },
  reminderMinutes: 10,
  enabled: true,
  requiresAck: false,
  optInDaily: false,
  proof: "text",
});
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

function RoutinesPage() {
  const s = useNocturne();
  const [edit, setEdit] = useState<Routine | null>(null);
  return (
    <AppShell eyebrow="Assigned structure. Clear expectations." title="Routines">
      {edit && s.viewRole === "dom" ? (
        <Editor r={edit} onDone={() => setEdit(null)} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              {s.viewRole === "dom"
                ? "Create and maintain the daily structure here. Check-ins and decisions stay on their own pages."
                : "Read your assigned routines here. Request a change rather than editing them directly."}
            </p>
            {s.viewRole === "dom" && <Button onClick={() => setEdit(blank())}>New routine</Button>}
          </div>
          {s.viewRole === "dom" && <RoutineDraft key={s.space.id ?? "demo"} onDraft={setEdit} />}
          <ul className="mt-6 divide-y divide-border">
            {s.routines.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 text-left">
                  <p className={r.enabled ? "text-ivory" : "text-muted-foreground line-through"}>
                    {r.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.windowStart}–{r.windowEnd} · {recurrenceLabel(r)}
                    {r.optInDaily ? " · opt-in" : ""}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{r.instructions}</p>
                  <p className="mt-2 text-[0.65rem] text-gold">
                    {r.proof === "confirmation"
                      ? "Self-confirmation"
                      : r.proof === "challenge"
                        ? "Neutral prompt + written check-in"
                        : "Written check-in"}{" "}
                    · Master review
                  </p>
                </div>
                {s.viewRole === "dom" ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>
                      Edit
                    </Button>
                    <Switch
                      aria-label={`Enable ${r.title}`}
                      checked={r.enabled}
                      onCheckedChange={(v) => actions.saveRoutine({ ...r, enabled: v })}
                    />
                  </div>
                ) : (
                  <RequestDialog
                    kind="routine_change"
                    routine={r}
                    trigger={
                      <Button variant="outline" size="sm">
                        Request change
                      </Button>
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}

function Editor({ r: init, onDone }: { r: Routine; onDone: () => void }) {
  const s = useNocturne();
  const [r, setR] = useState(init);
  const up = (p: Partial<Routine>) => setR({ ...r, ...p });
  const valid =
    r.title.trim() &&
    r.windowStart < r.windowEnd &&
    (r.recurrence.kind !== "weekdays" || r.recurrence.days.length > 0);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        if ((await actions.saveRoutine({ ...r, title: r.title.trim() })).ok) {
          toast.success("Routine saved");
          onDone();
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="t">Title</Label>
        <Input
          id="t"
          value={r.title}
          maxLength={60}
          onChange={(e) => up({ title: e.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="i">Instructions</Label>
        <Textarea
          id="i"
          value={r.instructions}
          maxLength={500}
          onChange={(e) => up({ instructions: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="ws">From</Label>
          <Input
            id="ws"
            type="time"
            value={r.windowStart}
            onChange={(e) => up({ windowStart: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="we">Until</Label>
          <Input
            id="we"
            type="time"
            value={r.windowEnd}
            onChange={(e) => up({ windowEnd: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="du">Due (opt.)</Label>
          <Input
            id="du"
            type="time"
            min={r.windowStart}
            max={r.windowEnd}
            value={r.dueTime ?? ""}
            onChange={(e) => {
              const { dueTime: _old, ...rest } = r;
              setR(e.target.value ? { ...r, dueTime: e.target.value } : rest);
            }}
          />
        </div>
      </div>
      {r.windowStart >= r.windowEnd && (
        <p className="text-sm text-destructive">End must be after start.</p>
      )}
      <div className="space-y-2">
        <Label>Repeats</Label>
        <div className="flex gap-2">
          {(["daily", "weekdays", "once"] as const).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={r.recurrence.kind === k ? "default" : "outline"}
              onClick={() =>
                up({
                  recurrence:
                    k === "daily"
                      ? { kind: "daily" }
                      : k === "once"
                        ? { kind: "once", date: dateKey(new Date(), s.space.timeZone) }
                        : { kind: "weekdays", days: [1, 2, 3, 4, 5] },
                })
              }
            >
              {k === "weekdays" ? "Selected days" : k.charAt(0).toUpperCase() + k.slice(1)}
            </Button>
          ))}
        </div>
        {r.recurrence.kind === "weekdays" && (
          <div className="flex gap-1">
            {DAYS.map((d, i) => {
              const days = r.recurrence.kind === "weekdays" ? r.recurrence.days : [];
              const on = days.includes(i);
              return (
                <button
                  type="button"
                  key={i}
                  aria-pressed={on}
                  aria-label={`Day ${i}`}
                  onClick={() =>
                    up({
                      recurrence: {
                        kind: "weekdays",
                        days: on ? days.filter((x) => x !== i) : [...days, i],
                      },
                    })
                  }
                  className={`h-9 w-9 rounded-full border text-sm ${on ? "border-wine bg-wine-soft text-ivory" : "text-muted-foreground"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}
        {r.recurrence.kind === "once" && (
          <Input
            type="date"
            aria-label="Date"
            value={r.recurrence.date}
            onChange={(e) => up({ recurrence: { kind: "once", date: e.target.value } })}
          />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="rm">Reminder (minutes before, blank for none)</Label>
        <Input
          id="rm"
          type="number"
          min={0}
          max={240}
          value={r.reminderMinutes ?? ""}
          onChange={(e) =>
            up({ reminderMinutes: e.target.value === "" ? null : Number(e.target.value) })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="routine-proof">Check-in policy</Label>
        <select
          id="routine-proof"
          className="native-select"
          value={r.proof ?? "text"}
          onChange={(e) =>
            up({
              proof: e.target.value as NonNullable<Routine["proof"]>,
              ...(e.target.value === "challenge" ? { optInDaily: true } : {}),
            })
          }
        >
          <option value="text">Written check-in · default</option>
          <option value="confirmation">Self-confirmation · no written evidence</option>
          <option value="challenge">Neutral one-time text prompt · human review</option>
          <option disabled>Camera / media · unsupported</option>
        </select>
        <p className="text-xs leading-5 text-muted-foreground">
          No AI verification or intimate media. Changing an existing proof policy resets both
          agreement acknowledgements. Neutral prompts do not prove liveness or prevent screenshots.
        </p>
      </div>
      {(
        [
          ["enabled", "Enabled"],
          ["requiresAck", "Require acknowledgement"],
          ["optInDaily", "Opt in each day"],
        ] as const
      ).map(([k, l]) => (
        <label key={k} className="flex items-center justify-between py-1 text-sm">
          {l}
          <Switch checked={r[k]} onCheckedChange={(v) => up({ [k]: v })} />
        </label>
      ))}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" disabled={!valid}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {s.routines.some((x) => x.id === r.id) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" className="ml-auto text-destructive">
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this routine?</AlertDialogTitle>
                <AlertDialogDescription>
                  Future assignments stop. Existing submissions and activity remain in history.
                  Review any pending work first.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    if ((await actions.deleteRoutine(r.id)).ok) {
                      toast("Routine removed");
                      onDone();
                    }
                  }}
                >
                  Delete routine
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </form>
  );
}
