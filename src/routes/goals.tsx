import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { RequestDialog } from "@/components/nocturne/RequestDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uiActions as actions, useNocturne } from "@/lib/nocturne/store";
import { dateKey, uid } from "@/lib/nocturne/logic";
import type { Goal } from "@/lib/nocturne/types";

export const Route = createFileRoute("/goals")({
  head: () => ({ meta: [{ title: "Goals — BoundSome" }] }),
  component: GoalsPage,
});
const CATEGORIES = {
  personal: "Personal discipline",
  wellbeing: "Health & wellbeing",
  work: "Work / study",
  relationship: "Relationship & household",
};
function GoalsPage() {
  const s = useNocturne(),
    [edit, setEdit] = useState<Goal | null>(null),
    [filter, setFilter] = useState<Goal["status"]>("active");
  const dom = s.viewRole === "dom",
    goals = (s.goals ?? []).filter((g) => g.status === filter);
  return (
    <AppShell
      eyebrow="Longer-term direction"
      title="Goals"
      readControls={
        !edit && (
          <div className="flex gap-2" role="group" aria-label="Goal status">
            {(["active", "completed", "archived"] as const).map((x) => (
              <Button
                key={x}
                size="sm"
                variant={filter === x ? "secondary" : "ghost"}
                onClick={() => setFilter(x)}
                className="capitalize"
              >
                {x}
              </Button>
            ))}
          </div>
        )
      }
    >
      {edit && dom ? (
        <GoalEditor key={edit.id} initial={edit} done={() => setEdit(null)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              {dom
                ? "Set clear expectations, define success, then review together."
                : "Your Master sets the goals. You can read the criteria and ask for a change."}
            </p>
            {dom ? (
              <Button
                onClick={() =>
                  setEdit({
                    id: uid(),
                    title: "",
                    instructions: "",
                    criteria: "",
                    dueDate: dateKey(new Date(), s.space.timeZone),
                    category: "personal",
                    status: "active",
                  })
                }
              >
                New goal
              </Button>
            ) : (
              <RequestDialog
                kind="permission"
                trigger={<Button variant="outline">Ask about a goal</Button>}
              />
            )}
          </div>
          {!goals.length && (
            <div className="py-12 text-center">
              <p className="font-display text-2xl italic text-muted-foreground">
                No {filter} goals yet.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Goals live here, separate from the daily routine.
              </p>
            </div>
          )}
          <ul className="mt-6 space-y-5">
            {goals.map((g) => (
              <li key={g.id} className="surface p-5">
                <p className="eyebrow">{CATEGORIES[g.category]}</p>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <h2 className="text-2xl">{g.title}</h2>
                  {dom && (
                    <Button size="sm" variant="ghost" onClick={() => setEdit(g)}>
                      Edit goal
                    </Button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {g.instructions}
                </p>
                <div className="mt-4 border-t pt-4">
                  <p className="text-xs text-gold">Success criteria</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{g.criteria}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Review by {g.dueDate} · {g.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
function GoalEditor({ initial, done }: { initial: Goal; done: () => void }) {
  const [g, setG] = useState(initial);
  const up = (p: Partial<Goal>) => setG({ ...g, ...p });
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          (await actions.saveGoal({ ...g, title: g.title.trim(), criteria: g.criteria.trim() })).ok
        ) {
          toast.success("Goal saved");
          done();
        }
      }}
    >
      <div>
        <Label htmlFor="goal-title">Goal title</Label>
        <Input
          id="goal-title"
          className="mt-2"
          value={g.title}
          onChange={(e) => up({ title: e.target.value })}
          required
          maxLength={60}
        />
      </div>
      <div>
        <Label htmlFor="goal-category">Area</Label>
        <select
          id="goal-category"
          className="native-select mt-2"
          value={g.category}
          onChange={(e) => up({ category: e.target.value as Goal["category"] })}
        >
          {Object.entries(CATEGORIES).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="goal-instructions">Instructions</Label>
        <Textarea
          id="goal-instructions"
          className="mt-2"
          value={g.instructions}
          onChange={(e) => up({ instructions: e.target.value })}
          maxLength={500}
        />
      </div>
      <div>
        <Label htmlFor="goal-criteria">Success criteria</Label>
        <Textarea
          id="goal-criteria"
          className="mt-2"
          value={g.criteria}
          onChange={(e) => up({ criteria: e.target.value })}
          maxLength={500}
          required
          placeholder="Describe the observable result, not an AI confidence score."
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="goal-date">Review date</Label>
          <Input
            id="goal-date"
            className="mt-2"
            type="date"
            value={g.dueDate}
            onChange={(e) => up({ dueDate: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="goal-status">Master decision</Label>
          <select
            id="goal-status"
            className="native-select mt-2"
            value={g.status}
            onChange={(e) => up({ status: e.target.value as Goal["status"] })}
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit">Save goal</Button>
        <Button type="button" variant="ghost" onClick={done}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
