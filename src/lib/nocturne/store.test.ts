import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
describe("persistent demo boundary", () => {
  it("refreshes a pause from another tab before allowing a mutation", async () => {
    const { actions, createInitialState } = await import("./store");
    expect(actions.onboard("dom", "Maya", "Aria").ok).toBe(true);
    const state = JSON.parse(localStorage.getItem("nocturne.demo.v1")!);
    state.pause = {
      active: true,
      sessionId: "other-tab-pause",
      resumeAck: { dom: false, sub: false },
    };
    localStorage.setItem("nocturne.demo.v1", JSON.stringify(state));
    expect(actions.saveRoutine(createInitialState().routines[0]!).ok).toBe(false);
    expect(JSON.parse(localStorage.getItem("nocturne.demo.v1")!).pause.active).toBe(true);
  });
  it("keeps preview-role switches and pending challenges out of persistent storage", async () => {
    const { actions } = await import("./store");
    actions.onboard("dom", "Maya", "Aria");
    const before = localStorage.getItem("nocturne.demo.v1");
    actions.setView("sub");
    expect(localStorage.getItem("nocturne.demo.v1")).toBe(before);
    actions.acknowledgeAgreement();
    expect(JSON.parse(localStorage.getItem("nocturne.demo.v1")!).viewRole).toBe("dom");
    expect(JSON.parse(localStorage.getItem("nocturne.demo.v1")!)).not.toHaveProperty("challenge");
  });
  it("does not overwrite corrupt saved data with an accidental action", async () => {
    localStorage.setItem("nocturne.demo.v1", "{damaged data");
    const { actions } = await import("./store");
    expect(actions.onboard("dom", "Maya", "Aria").ok).toBe(false);
    expect(localStorage.getItem("nocturne.demo.v1")).toBe("{damaged data");
    expect(actions.reset().ok).toBe(true);
    expect(JSON.parse(localStorage.getItem("nocturne.demo.v1")!).version).toBe(2);
  });
});
