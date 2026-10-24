// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteSpaceRepository } from "./remote-storage.server";
import { handleSpaceRequest } from "./space-api.server";

let directory: string;
let first: RemoteSpaceRepository, second: RemoteSpaceRepository;
const now = () => new Date("2026-10-24T12:00:00Z");
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "boundsome-remote-"));
  const url = `file:${join(directory, "shared.sqlite")}`;
  // Two independent clients emulate separate function instances against one primary.
  first = new RemoteSpaceRepository(createClient({ url }), now);
  second = new RemoteSpaceRepository(createClient({ url }), now);
});
afterEach(() => {
  first.close();
  second.close();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
async function pair() {
  const master = await first.create("Master", "dom", "", "Asia/Kolkata");
  const sub = await second.join(master.snapshot.invite!.token, "Sub");
  return { master, sub, id: master.snapshot.state.space.id! };
}
describe("durable remote storage", () => {
  it("keeps Telegram receipts atomic and requires both independent confirmations", async () => {
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "boundsome_test_bot");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s".repeat(32));
    const { master, sub, id } = await pair();
    async function command(session: string, command: unknown) {
      const snapshot = await first.read(session, id);
      return first.change(session, snapshot.revision, { command }, id);
    }
    await command(master.token, {
      type: "routine.save",
      routine: {
        id: "daily",
        title: "Check in",
        instructions: "Write a reflection",
        windowStart: "00:00",
        windowEnd: "23:59",
        recurrence: { kind: "daily" },
        reminderMinutes: null,
        enabled: true,
        requiresAck: false,
        optInDaily: false,
        proof: "text",
      },
    });
    await command(master.token, { type: "agreement.ack" });
    await command(sub.token, { type: "agreement.ack" });
    const m = await first.openTelegram(master.token, id, "daily");
    const s = await second.openTelegram(sub.token, id, "daily");
    expect(m.ticketId).toBe(s.ticketId);
    await first.telegramUpdate(
      1,
      "101",
      `/start ${new URL(m.link).searchParams.get("start")}`,
      false,
    );
    await second.telegramUpdate(
      2,
      "202",
      `/start ${new URL(s.link).searchParams.get("start")}`,
      false,
    );
    expect(await first.telegramUpdate(3, "101", `/yes ${m.ticketId}`, false)).toContain("Waiting");
    expect((await second.read(sub.token, id)).state.submissions).toHaveLength(0);
    expect(await second.telegramUpdate(4, "202", `/yes ${s.ticketId}`, false)).toContain(
      "Proof submitted successfully",
    );
    await first.telegramUpdate(4, "202", `/yes ${s.ticketId}`, false);
    expect((await second.read(sub.token, id)).state.submissions).toHaveLength(1);
    await command(sub.token, { type: "pause", signal: "RED", reason: "Check in" });
    await expect(first.openTelegram(master.token, id, "daily")).rejects.toMatchObject({
      status: 400,
    });
  });
  it("creates, previews, joins and reads through independent instances", async () => {
    const master = await first.create("Maya", "dom");
    const token = master.snapshot.invite!.token;
    expect(await second.preview(token)).toEqual({ creatorName: "Maya", role: "sub" });
    const sub = await second.join(token, "Aria");
    const read = await first.read(master.token);
    expect(read.state.space.paired).toBe(true);
    expect(read.state.names.sub).toBe("Aria");
    expect((await second.read(sub.token)).state.myRole).toBe("sub");
    await expect(first.join(token, "Outsider")).rejects.toMatchObject({ status: 410 });
    first.close();
    first = new RemoteSpaceRepository(
      createClient({ url: `file:${join(directory, "shared.sqlite")}` }),
      now,
    );
    expect((await first.read(master.token)).state.names.sub).toBe("Aria");
  });
  it("rejects one of two concurrent invite redemptions atomically", async () => {
    const master = await first.create("Maya", "dom");
    const token = master.snapshot.invite!.token;
    const results = await Promise.allSettled([first.join(token, "A"), second.join(token, "B")]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect((await first.read(master.token)).state.space.paired).toBe(true);
  });
  it("isolates spaces and rejects forged membership", async () => {
    const { master, sub, id } = await pair();
    const other = await second.create("Other", "dom");
    await expect(first.read(other.token, id)).rejects.toMatchObject({ status: 403 });
    const before = await first.read(master.token, id);
    await first.change(
      master.token,
      before.revision,
      { command: { type: "message", channel: "notes", text: "Private to this pair" } },
      id,
    );
    expect((await second.read(sub.token, id)).state.messages[0]?.text).toBe("Private to this pair");
    expect((await second.read(other.token)).state.messages).toEqual([]);
  });
  it("enforces roles, stale revision rejection, rollback and safety pauses", async () => {
    const { master, sub, id } = await pair();
    let read = await first.read(master.token, id);
    const cmd = { type: "message", channel: "notes", text: "Before pause" };
    await first.change(master.token, read.revision, { command: cmd }, id);
    await expect(
      second.change(master.token, read.revision, { command: cmd }, id),
    ).rejects.toMatchObject({ status: 409 });
    read = await first.read(master.token, id);
    await expect(
      second.change(
        sub.token,
        read.revision,
        { command: { type: "routine.delete", id: "missing" } },
        id,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect((await first.read(master.token, id)).revision).toBe(read.revision);
    // RED succeeds even with a stale revision, then blocks both people.
    await second.change(
      sub.token,
      1,
      { command: { type: "pause", signal: "RED", reason: "Check in" } },
      id,
    );
    read = await first.read(master.token, id);
    expect(read.state.pause.active).toBe(true);
    await expect(
      first.change(master.token, read.revision, { command: cmd }, id),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("awaits database commit before returning a created-space HTTP response", async () => {
    const response = await handleSpaceRequest(
      new Request("https://boundsome.test/api/space", {
        method: "POST",
        headers: { origin: "https://boundsome.test", "content-type": "application/json" },
        body: JSON.stringify({ op: "create", name: "Maya", role: "dom", adult: true }),
      }),
      first,
    );
    expect(response.status).toBe(201);
    const snapshot = await response.json();
    expect(snapshot.state.names.dom).toBe("Maya");
    const cookie = response.headers.get("set-cookie")!.split(";")[0]!.split("=")[1]!;
    expect((await second.read(cookie)).state.space.id).toBe(snapshot.state.space.id);
  });
  it("does not initialize storage for a visitor with no session", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    const response = await handleSpaceRequest(new Request("https://boundsome.test/api/space"));
    expect(response.status).toBe(401);
  });
  it("reports missing hosted database configuration instead of creating a temporary database", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    const response = await handleSpaceRequest(
      new Request("https://boundsome.test/api/space", {
        method: "POST",
        headers: { origin: "https://boundsome.test", "content-type": "application/json" },
        body: JSON.stringify({ op: "create", name: "Maya", role: "dom", adult: true }),
      }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("TURSO_DATABASE_URL");
  });
});
