import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/nocturne/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { uiActions as actions, useNocturne } from "@/lib/nocturne/store";

export const Route = createFileRoute("/discussion")({
  head: () => ({ meta: [{ title: "Pause discussion — BoundSome" }] }),
  component: DiscussionPage,
});
function DiscussionPage() {
  const s = useNocturne(),
    [text, setText] = useState("");
  const messages = s.messages.filter(
    (x) => x.channel === "discussion" && (!s.pause.active || x.pauseSession === s.pause.sessionId),
  );
  const bothSpoke = ["dom", "sub"].every((role) => messages.some((m) => m.by === role));
  return (
    <AppShell
      title="Pause discussion"
      eyebrow="No directives. Just a conversation."
      allowDuringPause
    >
      <p className="text-sm leading-6 text-muted-foreground">
        {s.pause.active
          ? "This is the only discussion channel open during a pause. Each person must contribute, then independently confirm readiness. A new message resets both confirmations. The app records participation; it cannot judge whether a discussion is meaningful."
          : "The dynamic is active. Previous pause discussions remain readable."}
      </p>
      <ul className="my-7 space-y-4">
        {messages.map((m) => (
          <li
            key={m.id}
            className={`max-w-[90%] rounded-md p-4 ${m.by === s.viewRole ? "ml-auto bg-wine-soft/50" : "bg-secondary"}`}
          >
            <p className="whitespace-pre-wrap text-sm leading-6">{m.text}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {s.names[m.by]} · {new Date(m.at).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
      {s.pause.active && (
        <>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if ((await actions.sendMessage(text.trim(), "discussion")).ok) setText("");
            }}
          >
            <Label htmlFor="discussion-message">Your message</Label>
            <Textarea
              id="discussion-message"
              className="my-3"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              required
              placeholder="What needs to change before you feel ready?"
            />
            <Button type="submit" disabled={!text.trim()}>
              Send discussion message
            </Button>
          </form>
          <div className="mt-8 border-t pt-6">
            <h2 className="text-2xl">Ready after discussion?</h2>
            <p className="my-3 text-sm text-muted-foreground">
              {s.names.dom}: {s.pause.resumeAck.dom ? "ready" : "not yet"} · {s.names.sub}:{" "}
              {s.pause.resumeAck.sub ? "ready" : "not yet"}
            </p>
            <Button
              disabled={!bothSpoke || s.pause.resumeAck[s.viewRole]}
              onClick={async () => {
                if ((await actions.ackResume()).ok) toast("Readiness recorded");
              }}
            >
              {s.pause.resumeAck[s.viewRole]
                ? "Waiting for partner"
                : "We've discussed — I'm ready"}
            </Button>
            {!bothSpoke && (
              <p className="mt-3 text-xs text-muted-foreground">
                Both people must contribute to this pause discussion first.
              </p>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
