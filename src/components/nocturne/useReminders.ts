import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { dateKey, minutesOf, occursOn, taskKey } from "@/lib/nocturne/logic";
import { useNocturne } from "@/lib/nocturne/store";
import { agreementReady } from "@/lib/nocturne/engine";

function inQuiet(now: number, start: string, end: string) {
  const s = minutesOf(start);
  const e = minutesOf(end);
  return s <= e ? now >= s && now < e : now >= s || now < e;
}

/** In-app reminders while the app is open. Silent during pause and quiet hours. */
export function useReminders() {
  const s = useNocturne();
  const fired = useRef(new Set<string>());
  useEffect(() => {
    if (!s.onboarded || s.viewRole !== "sub" || !agreementReady(s)) return;
    const tick = () => {
      if (s.pause.active || !s.prefs.inAppReminders) return;
      const d = new Date();
      const now = d.getHours() * 60 + d.getMinutes();
      if (inQuiet(now, s.prefs.quietStart, s.prefs.quietEnd)) return;
      const today = dateKey(d);
      for (const r of s.routines) {
        if (r.reminderMinutes == null || !occursOn(r, today)) continue;
        if (r.optInDaily && !s.tasks[taskKey(r.id, today)]?.optedIn) continue;
        const k = taskKey(r.id, today);
        if (s.tasks[k] && s.tasks[k].status !== "pending") continue;
        const start = minutesOf(r.windowStart);
        if (now >= start - r.reminderMinutes && now <= start && !fired.current.has(k)) {
          fired.current.add(k);
          toast(r.title, { description: `Opens at ${r.windowStart}` });
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [s]);
}
