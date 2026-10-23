import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "./initial-state";
import type { SpaceSnapshot } from "./space-protocol";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

function snapshot(id: string, revision = 1, paused = false): SpaceSnapshot {
  const initial = createInitialState();
  return {
    state: {
      ...initial,
      onboarded: true,
      myRole: "dom",
      viewRole: "dom",
      space: { mode: "shared", id, paired: true, inviteCode: "", timeZone: "UTC" },
      pause: { active: paused, resumeAck: { dom: false, sub: false } },
    },
    revision,
    createdByMe: true,
    invite: null,
    spaces: [
      { id: "A", role: "dom", partnerName: "First", paired: true, paused },
      { id: "B", role: "dom", partnerName: "Second", paired: true, paused: false },
    ],
    telegram: { configured: false, proofs: [] },
  };
}
const response = (snapshot: SpaceSnapshot) =>
  ({ ok: true, json: async () => snapshot }) as Response;
function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it("keeps controls busy while RED interrupts an in-flight space switch", async () => {
  const switchResult = deferred(),
    stopResult = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(snapshot("A")))
    .mockReturnValueOnce(switchResult.promise)
    .mockReturnValueOnce(stopResult.promise)
    .mockResolvedValueOnce(response(snapshot("B")));
  vi.stubGlobal("fetch", fetcher);
  const { restoreSharedSpace, spaceActions, uiActions } = await import("./store");
  await restoreSharedSpace();
  const switching = spaceActions.open("B"),
    stopping = uiActions.pause("Stop", "RED");
  switchResult.resolve(response(snapshot("B")));
  expect((await switching).ok).toBe(false);
  expect((await spaceActions.open("B")).ok).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(3);
  stopResult.resolve(response(snapshot("A", 2, true)));
  await stopping;
  expect(sessionStorage.getItem("nocturne.active-space")).toBe("A");
  expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toMatchObject({
    spaceId: "A",
    command: { type: "pause" },
  });
  expect((await spaceActions.open("B")).ok).toBe(true);
  expect(sessionStorage.getItem("nocturne.active-space")).toBe("B");
});
it("does not reopen an old space when its stop response arrives after creating another relationship", async () => {
  const created = deferred(),
    stopped = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(snapshot("A")))
    .mockReturnValueOnce(created.promise)
    .mockReturnValueOnce(stopped.promise);
  vi.stubGlobal("fetch", fetcher);
  const { restoreSharedSpace, spaceActions, uiActions } = await import("./store");
  await restoreSharedSpace();
  const creating = spaceActions.create("New alias", "dom"),
    stopping = uiActions.pause("Stop", "RED");
  created.resolve(response(snapshot("B")));
  await creating;
  stopped.resolve(response(snapshot("A", 2, true)));
  expect((await stopping).ok).toBe(true);
  expect(sessionStorage.getItem("nocturne.active-space")).toBe("B");
  expect(JSON.parse(fetcher.mock.calls[2]![1].body).spaceId).toBe("A");
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
