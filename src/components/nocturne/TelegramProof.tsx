import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useNocturne, useSpaceConnection, restoreSharedSpace } from "@/lib/nocturne/store";

export function TelegramProof() {
  const state = useNocturne(),
    connection = useSpaceConnection();
  const [routineId, setRoutineId] = useState(""),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (state.space.mode !== "shared") return null;
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
      <summary className="cursor-pointer font-display text-xl">Telegram proof collection</summary>
      <p className="my-3 text-xs leading-6 text-muted-foreground">
        Share optional media in your agreed Telegram conversation. Each person opens their own link
        here, then confirms in the private bot. Both must say yes before a receipt appears in the
        app. A text alternative remains available. Keep your personal link private.
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
            {state.routines
              .filter((r) => r.enabled && r.proof !== "challenge")
              .map((r) => (
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
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
      <ul className="mt-4 space-y-3 text-xs">
        {connection.telegram.proofs.map((p) => (
          <li key={p.id} className="rounded-md border p-3">
            <p>
              {state.routines.find((r) => r.id === p.routineId)?.title ?? "Archived routine"} ·{" "}
              {p.date}
            </p>
            <p className="mt-2 text-muted-foreground">
              {p.status === "submitted"
                ? "Proof submitted successfully"
                : p.status === "pending"
                  ? "Waiting for both confirmations"
                  : p.status}{" "}
              · Master {p.masterConfirmed ? "yes" : "pending"} · Sub{" "}
              {p.subConfirmed ? "yes" : "pending"}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
