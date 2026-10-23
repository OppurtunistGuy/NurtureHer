import { describe, expect, it, vi } from "vitest";
import { effectiveStatus, isOverdue, occursOn, randomInviteCode, uid } from "./logic";
import type { Routine } from "./types";

const base: Routine = {
  id: "r",
  title: "Wake",
  instructions: "",
  windowStart: "05:30",
  windowEnd: "06:00",
  recurrence: { kind: "daily" },
  reminderMinutes: 10,
  enabled: true,
  requiresAck: false,
  optInDaily: false,
};

describe("nocturne rules", () => {
  it("creates random v4 IDs on HTTP previews without crypto.randomUUID", () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal("crypto", { getRandomValues });
    try {
      const ids = Array.from({ length: 100 }, () => uid());
      expect(new Set(ids).size).toBe(100);
      for (const id of ids)
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("pause overrides a pending task", () => {
    expect(effectiveStatus({ status: "pending", updatedAt: "", by: "sub" }, true)).toBe("paused");
    expect(effectiveStatus(undefined, true)).toBe("paused");
  });

  it("overdue only flags pending tasks and never changes status", () => {
    const late = new Date(2026, 0, 1, 7, 0);
    expect(isOverdue(base, "pending", late)).toBe(true);
    expect(isOverdue(base, "excused", late)).toBe(false);
    expect(effectiveStatus(undefined, false)).toBe("pending");
  });

  it("weekday recurrence only matches selected days", () => {
    const r: Routine = { ...base, recurrence: { kind: "weekdays", days: [1] } };
    expect(occursOn(r, "2026-10-19")).toBe(true); // Monday
    expect(occursOn(r, "2026-10-20")).toBe(false);
    expect(occursOn({ ...base, enabled: false }, "2026-10-19")).toBe(false);
  });

  it("invite codes are random and 10 characters", () => {
    const a = randomInviteCode();
    expect(a).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(a).not.toBe(randomInviteCode());
  });
});
