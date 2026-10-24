import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNocturne, useSpaceConnection } from "@/lib/nocturne/store";
import { savedStateSchema } from "@/lib/nocturne/storage";
import type { Routine } from "@/lib/nocturne/types";

export function RoutineDraft({ onDraft }: { onDraft: (routine: Routine) => void }) {
  const s = useNocturne();
  const connection = useSpaceConnection();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const available =
    s.space.mode === "shared" &&
    !!s.space.id &&
    s.viewRole === "dom" &&
    !s.pause.active &&
    !connection.busy &&
    connection.status === "connected";

  // A result for a previous space or a newly paused relationship must never open an editor.
  useEffect(() => {
    setBusy(false);
    setError("");
    return () => {
      const controller = request.current;
      request.current = null;
      controller?.abort();
    };
  }, [s.space.id, available]);

  async function generate() {
    if (!available || busy || !prompt.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/space", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "draft", spaceId: s.space.id, prompt: prompt.trim() }),
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "AI drafting is unavailable. Try again later.",
        );
      const parsed = savedStateSchema.shape.routines.element.safeParse(data.routine);
      if (!parsed.success)
        throw new Error("AI returned no usable draft. Try again or create a routine manually.");
      const { dueTime, ...draft } = parsed.data;
      onDraft({ ...draft, ...(dueTime === undefined ? {} : { dueTime }) });
    } catch (failure) {
      if (request.current !== controller) return;
      setError(
        controller.signal.aborted
          ? "Drafting stopped or timed out. Try again when this space is active."
          : failure instanceof Error
            ? failure.message
            : "AI drafting is unavailable. Try again later.",
      );
    } finally {
      clearTimeout(timer);
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <details className="mt-6 rounded-lg border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium">Draft a routine with AI</summary>
      <div className="mt-4 space-y-3">
        <p className="text-xs leading-5 text-muted-foreground">
          Only the description you submit is sent to the configured AI service (OpenAI directly, or
          via Vercel AI Gateway). Names, notes, your agreement, and media are not attached. Review
          and edit the draft before saving it.
        </p>
        {s.space.mode !== "shared" && (
          <p className="text-sm text-muted-foreground">Open a shared space to use AI drafting.</p>
        )}
        <Label htmlFor="routine-draft-prompt">Describe the routine</Label>
        <Textarea
          id="routine-draft-prompt"
          value={prompt}
          maxLength={2000}
          placeholder="For example: a weekday study check-in, 7–8 pm, with a short written reflection."
          disabled={!available || busy}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!available || busy || !prompt.trim()}
          onClick={generate}
        >
          {busy ? "Drafting…" : "Generate editable draft"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Nothing is saved until you choose Save in the editor.
        </p>
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            Preparing your draft…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
