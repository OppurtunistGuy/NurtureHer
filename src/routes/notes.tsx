import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/nocturne/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { uiActions as actions, useNocturne } from "@/lib/nocturne/store";

export const Route = createFileRoute("/notes")({
  head: () => ({
    meta: [
      { title: "Notes — BoundSome" },
      { name: "description", content: "Private text notes between partners." },
      { property: "og:title", content: "Notes — BoundSome" },
      { property: "og:description", content: "Private text notes." },
    ],
  }),
  component: NotesPage,
});

function NotesPage() {
  const s = useNocturne();
  const [text, setText] = useState("");
  return (
    <AppShell eyebrow="Text only" title="Notes">
      {s.messages.filter((m) => m.channel !== "discussion").length === 0 && (
        <p className="py-8 text-center font-display text-xl italic text-muted-foreground">
          No notes yet.
        </p>
      )}
      <ul className="space-y-3">
        {s.messages
          .filter((m) => m.channel !== "discussion")
          .map((m) => {
            const mine = m.by === s.viewRole;
            const r = s.routines.find((x) => x.id === m.routineId);
            return (
              <li
                key={m.id}
                className={`max-w-[85%] rounded-lg px-4 py-2 text-sm ${mine ? "ml-auto bg-wine-soft" : "bg-secondary"}`}
              >
                {r && <p className="eyebrow text-[0.6rem]">re: {r.title}</p>}
                <p className="whitespace-pre-wrap">{m.text}</p>
                <p className="mt-1 text-[0.65rem] text-muted-foreground">
                  {s.names[m.by]} · {new Date(m.at).toLocaleString()}
                </p>
              </li>
            );
          })}
      </ul>
      <form
        className="mt-6 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          if ((await actions.sendMessage(text.trim())).ok) setText("");
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          aria-label="Message"
          rows={2}
        />
        <Button type="submit" disabled={!text.trim()}>
          Send
        </Button>
      </form>
    </AppShell>
  );
}
