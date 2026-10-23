import { actions, useNocturne } from "@/lib/nocturne/store";
import type { Role } from "@/lib/nocturne/types";

/** Demo-only: lets one person preview both sides. Never implies a real partner is connected. */
export function RoleSwitch() {
  const s = useNocturne();
  return (
    <div
      role="radiogroup"
      aria-label="Preview as"
      className="flex flex-wrap items-center gap-1 text-sm"
    >
      <span className="mr-1">Preview as</span>
      {(["dom", "sub"] as Role[]).map((r) => (
        <button
          key={r}
          role="radio"
          aria-checked={s.viewRole === r}
          onClick={() => actions.setView(r)}
          className={`rounded px-2 py-0.5 ${s.viewRole === r ? "bg-primary text-primary-foreground" : "hover:text-foreground"}`}
        >
          {r === "dom" ? "Master" : "Sub"}
          {s.myRole === r ? " (you)" : ""}
        </button>
      ))}
    </div>
  );
}
