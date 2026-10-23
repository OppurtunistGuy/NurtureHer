import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pause, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uiActions as actions, useNocturne } from "@/lib/nocturne/store";

export function PauseButton({ compact = false }: { compact?: boolean }) {
  const s = useNocturne(),
    [reason, setReason] = useState("");
  if (s.pause.active || (s.space.mode === "shared" && !s.space.paired)) return null;
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="border-destructive/50 px-2 text-destructive"
        aria-label="RED — stop now"
        title="Stop immediately"
        onClick={async () => {
          if ((await actions.pause("", "RED")).ok) toast("RED — stopped immediately");
        }}
      >
        RED
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="border-gold/40 px-2 text-gold"
        aria-label="YELLOW — pause for a check-in"
        title="Pause and check in"
        onClick={async () => {
          if ((await actions.pause("", "YELLOW")).ok) toast("YELLOW — paused for a check-in");
        }}
      >
        YELLOW
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size={compact ? "sm" : "lg"}
            className={compact ? "hidden border-wine text-ivory sm:inline-flex" : "w-full"}
          >
            <Pause className="h-4 w-4" />
            Pause
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">
              Pause the dynamic?
            </AlertDialogTitle>
            <AlertDialogDescription>
              All operational changes stop immediately for both people. Only reading, discussion and
              mutual resume acknowledgement remain. No reason is required; pausing never has
              consequences.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            aria-label="Optional pause note"
            placeholder="Optional note"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if ((await actions.pause(reason.trim())).ok) {
                  setReason("");
                  toast("Paused — take the time you need");
                }
              }}
            >
              Pause now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
export function PauseBanner() {
  const s = useNocturne();
  if (!s.pause.active) return null;
  return (
    <div role="status" className="border-b border-wine bg-wine-soft/50">
      <div className="mx-auto flex max-w-3xl gap-3 px-4 py-5">
        <LockKeyhole className="mt-1 h-5 w-5 shrink-0 text-gold" />
        <div className="flex-1">
          <p className="font-display text-2xl">Paused. Your space is read-only.</p>
          {s.pause.signal && (
            <p className="mt-2 text-sm text-gold">
              {s.pause.signal === "RED"
                ? "RED — stop the activity immediately."
                : "YELLOW — pause and check in before proceeding."}
            </p>
          )}
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Assignments, submissions, reviews, notes and settings are locked. Discuss first, then
            both acknowledge readiness.
          </p>
          {s.pause.reason && <p className="mt-2 text-sm">“{s.pause.reason}”</p>}
          <Link
            to="/discussion"
            className="mt-3 inline-block rounded-md border border-gold/40 px-3 py-2 text-sm text-gold"
          >
            Open pause discussion
          </Link>
        </div>
      </div>
    </div>
  );
}
