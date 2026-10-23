import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { actions, useNocturne } from "@/lib/nocturne/store";
import type { Routine } from "@/lib/nocturne/types";

export function SubmissionDialog({ routine, disabled }: { routine: Routine; disabled: boolean }) {
  const s = useNocturne(),
    [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);
  const challenge = s.challenge?.routineId === routine.id ? s.challenge : undefined;
  const remaining = Math.max(0, Math.ceil(((challenge?.expiresAt ?? 0) - now) / 1000));
  const proof = routine.proof ?? "text";
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setText("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}>
          Submit check-in
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{routine.title}</DialogTitle>
          <DialogDescription>
            {proof === "confirmation"
              ? "Confirm completion. Master review is still required."
              : "Write a short account of what you completed. This is self-reported evidence, not independent verification."}
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={s.pause.active || s.viewRole !== "sub"} className="space-y-4">
          {proof === "challenge" && (
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Neutral one-time prompt · local demo · no camera or identity check
              </p>
              {challenge && (
                <p className="my-3 font-mono text-lg text-gold" aria-live="polite">
                  {challenge.prompt} · {remaining ? `${remaining}s` : "Expired"}
                </p>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (actions.generateChallenge(routine.id).ok) setNow(Date.now());
                }}
              >
                {challenge ? "Replace prompt" : "Generate prompt"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Include the prompt in your response within 60 seconds. This is not a secret phrase
                or proof of liveness.
              </p>
            </div>
          )}
          <div>
            <Label htmlFor="proof-note">
              {proof === "confirmation" ? "Note (optional)" : "Your check-in"}
            </Label>
            <Textarea
              id="proof-note"
              className="mt-2"
              rows={4}
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Saved as readable text in this browser. Do not submit private or sensitive information.
          </p>
          <DialogFooter>
            <Button
              disabled={
                (proof !== "confirmation" && !text.trim()) ||
                (proof === "challenge" && (!challenge || remaining === 0))
              }
              onClick={() => {
                if (actions.submitProof(routine.id, text.trim(), challenge?.id).ok) {
                  toast.success("Submitted for Master review");
                  setOpen(false);
                  setText("");
                }
              }}
            >
              Submit for review
            </Button>
          </DialogFooter>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
