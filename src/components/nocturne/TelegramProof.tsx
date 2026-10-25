import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  uiActions,
  useNocturne,
  useSpaceConnection,
  restoreSharedSpace,
} from "@/lib/nocturne/store";

export function TelegramProof() {
  const state = useNocturne(),
    connection = useSpaceConnection();
  const [routineId, setRoutineId] = useState(""),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [answering, setAnswering] = useState("");
  const [recording, setRecording] = useState("");
  if (state.space.mode !== "shared") return null;
  // One punishment entry per not-performed ticket; the id makes a second tap a no-op.
  const punishmentId = (ticketId: string) => `punish-${ticketId}`;
  const recorded = (ticketId: string) =>
    (state.points?.ledger ?? []).some(
      (entry) => entry.id === punishmentId(ticketId) && !entry.voidedAt,
    );
  const recordPunishment = async (
    ticketId: string,
    title: string,
    points: number,
    note: string,
  ) => {
    setRecording(ticketId);
    try {
      const result = await uiActions.awardPoints({
        id: punishmentId(ticketId),
        kind: "punishment",
        amount: points,
        reason: `Not performed: ${title}${note ? ` · ${note}` : ""}`.slice(0, 500),
      });
      if (result.ok) toast.success("Punishment recorded");
    } finally {
      setRecording("");
    }
  };
  const eligible = state.routines.filter(
    (r) => r.enabled && r.proof !== "challenge" && r.telegramVerify,
  );
  const mine = state.myRole === "dom" ? "masterAnswer" : "subAnswer";
  const answer = async (ticketId: string, value: "yes" | "no") => {
    setAnswering(ticketId);
    try {
      const response = await fetch("/api/space", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          op: "telegram.answer",
          spaceId: state.space.id,
          ticketId,
          answer: value,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not record your answer.");
      toast(data.message);
      await restoreSharedSpace();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record your answer.");
    } finally {
      setAnswering("");
    }
  };
  const open = async () => {
    setBusy(true);
    setError("");
    setLink("");
    try {
      const response = await fetch("/api/space", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ op: "telegram.open", spaceId: state.space.id, routineId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not open Telegram collection.");
      setLink(data.link);
      await restoreSharedSpace();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open Telegram collection.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="mt-8 border-t pt-5">
      <summary className="cursor-pointer font-display text-xl">Telegram verification</summary>
      <p className="my-3 text-xs leading-6 text-muted-foreground">
        For routines with Verify on Telegram. Each person links their private chat with the bot
        once, then answers Yes or No there or here. Both yes completes the task; either No marks it
        not performed; no answer by the end of the day leaves it not verified. Photos stay in
        Telegram and are not downloaded by the app. Keep your personal link private.
      </p>
      {!connection.telegram.configured ? (
        <p className="text-sm text-muted-foreground">Telegram setup is pending on this server.</p>
      ) : (
        <div className="space-y-3">
          <label htmlFor="telegram-routine" className="text-sm">
            Routine for this receipt
          </label>
          <select
            id="telegram-routine"
            className="native-select w-full"
            value={routineId}
            onChange={(e) => {
              setRoutineId(e.target.value);
              setLink("");
              setError("");
            }}
          >
            <option value="">Choose a routine</option>
            {eligible.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={!routineId || busy || state.pause.active}
            onClick={open}
          >
            {busy ? "Opening…" : "Get my Telegram link"}
          </Button>
          {link && (
            <p>
              <a
                className="text-sm text-gold underline"
                href={link}
                target="_blank"
                rel="noreferrer"
              >
                Open my private bot link
              </a>
            </p>
          )}
          {!eligible.length && (
            <p className="text-xs text-muted-foreground">
              Turn on Verify on Telegram for a routine to use it here.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
      <ul className="mt-4 space-y-3 text-xs">
        {connection.telegram.proofs.map((p) => {
          const routine = state.routines.find((r) => r.id === p.routineId);
          const consequence =
            p.status === "not_performed" && routine?.punishmentPoints
              ? { points: routine.punishmentPoints, note: routine.punishmentNote ?? "" }
              : null;
          return (
            <li key={p.id} className="rounded-md border p-3">
              <p>
                {routine?.title ?? "Archived routine"} · {p.date}
              </p>
              {consequence && (
                <div className="mt-2 rounded-md border border-destructive/40 p-2">
                  <p>
                    Agreed consequence: {consequence.points} punishment points
                    {consequence.note ? ` · ${consequence.note}` : ""}
                  </p>
                  {state.myRole === "dom" &&
                    (recorded(p.id) ? (
                      <p className="mt-1 text-muted-foreground">Punishment recorded.</p>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={!!recording || state.pause.active}
                        onClick={() =>
                          recordPunishment(
                            p.id,
                            routine?.title ?? "routine",
                            consequence.points,
                            consequence.note,
                          )
                        }
                      >
                        {recording === p.id ? "Recording…" : "Record punishment"}
                      </Button>
                    ))}
                </div>
              )}
              <p className="mt-2 text-muted-foreground">
                {STATUS[p.status] ?? p.status} · {state.names.dom}{" "}
                {word(p.masterAnswer ?? (p.masterConfirmed ? "yes" : null))} · {state.names.sub}{" "}
                {word(p.subAnswer ?? (p.subConfirmed ? "yes" : null))}
              </p>
              {p.status === "pending" && !p[mine] && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!!answering || state.pause.active}
                    onClick={() => answer(p.id, "yes")}
                  >
                    {state.myRole === "dom" ? "Yes, I verified it" : "Yes, I did it"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!answering || state.pause.active}
                    onClick={() => answer(p.id, "no")}
                  >
                    {state.myRole === "dom" ? "No, not done" : "No, I didn't"}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

const STATUS: Record<string, string> = {
  pending: "Waiting for both answers",
  verified: "Verified by both · completed",
  not_performed: "Not performed",
  not_verified: "Not verified · no answer by the end of the day",
  submitted: "Receipt submitted",
  declined: "Declined",
};
const word = (value: "yes" | "no" | null) =>
  value === "yes" ? "yes" : value === "no" ? "no" : "waiting";
