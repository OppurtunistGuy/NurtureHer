import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/nocturne/AppShell";
import { useNocturne } from "@/lib/nocturne/store";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Nocturne" },
      { name: "description", content: "History of task status and agreement changes." },
      { property: "og:title", content: "Activity — Nocturne" },
      { property: "og:description", content: "Shared activity history." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const s = useNocturne();
  return (
    <AppShell eyebrow="Shared history" title="Activity">
      <ul className="divide-y divide-border text-sm">
        {s.activity.map((a) => (
          <li key={a.id} className="py-3">
            <p>{a.text}</p>
            <p className="text-xs text-muted-foreground">
              {a.by === "system" ? "Nocturne" : s.names[a.by]} · {new Date(a.at).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
