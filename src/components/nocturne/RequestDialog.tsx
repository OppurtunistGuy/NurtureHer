import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actions, useNocturne } from "@/lib/nocturne/store";
import { dateKey } from "@/lib/nocturne/logic";
import type { RequestKind, RequestReason, Routine } from "@/lib/nocturne/types";

export const REQUEST_LABEL: Record<RequestKind, string> = {
  illness: "Report feeling unwell",
  extension: "Request an extension",
  permission: "Ask permission",
  routine_change: "Request a routine change",
  skip: "Request to skip",
};
export function RequestDialog({
  kind,
  routine,
  trigger,
}: {
  kind: RequestKind;
  routine?: Routine;
  trigger: ReactNode;
}) {
  const s = useNocturne(),
    [open, setOpen] = useState(false),
    [reason, setReason] = useState<RequestReason>(kind === "illness" ? "health" : ""),
    [returnAt, setReturnAt] = useState(""),
    [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{REQUEST_LABEL[kind]}</DialogTitle>
          <DialogDescription>
            {routine?.title ? `${routine.title}. ` : ""}No change takes effect until reviewed.
            Health and emergencies never require permission to seek care; pause at any time.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={s.pause.active} className="space-y-4">
          <div>
            <Label htmlFor="request-reason">Reason (optional)</Label>
            <select
              id="request-reason"
              className="native-select mt-2"
              value={reason}
              onChange={(e) => setReason(e.target.value as RequestReason)}
            >
              <option value="">Prefer not to say</option>
              <option value="health">Health</option>
              <option value="emergency">Emergency</option>
              <option value="study_work">Study / work</option>
              <option value="sleep">Sleep</option>
              <option value="other">Other</option>
            </select>
          </div>
          {kind === "extension" && (
            <div>
              <Label htmlFor="request-time">New deadline (today)</Label>
              <Input
                id="request-time"
                type="time"
                value={returnAt}
                onChange={(e) => setReturnAt(e.target.value)}
                required
              />
            </div>
          )}
          <div>
            <Label htmlFor="request-note">
              Note {kind === "permission" || kind === "routine_change" ? "" : "(optional)"}
            </Label>
            <Textarea
              id="request-note"
              className="mt-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={
                (kind === "extension" && !returnAt) ||
                (["permission", "routine_change"].includes(kind) && !note.trim())
              }
              onClick={() => {
                const result = actions.submitRequest({
                  kind,
                  date: dateKey(),
                  reason,
                  note: note.trim(),
                  ...(routine ? { routineId: routine.id } : {}),
                  ...(returnAt ? { returnAt } : {}),
                });
                if (result.ok) {
                  toast.success("Request submitted");
                  setOpen(false);
                  setNote("");
                  setReturnAt("");
                }
              }}
            >
              Submit request
            </Button>
          </DialogFooter>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
