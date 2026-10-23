// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SpaceRepository } from "./space-repository.server";
import { handleTelegramRequest } from "./space-api.server";

let db: SpaceRepository,
  now: Date,
  master: string,
  sub: string,
  spaceId: string,
  update = 0;
const routine = {
  id: "daily",
  title: "Check in",
  instructions: "Write an update",
  windowStart: "00:00",
  windowEnd: "23:59",
  recurrence: { kind: "daily" as const },
  reminderMinutes: null,
  enabled: true,
  requiresAck: false,
  optInDaily: false,
  proof: "text" as const,
};
function command(session: string, command: unknown) {
  const s = db.read(session, spaceId);
  return db.change(session, s.revision, { command }, spaceId);
}
function open(session: string) {
  const ticket = db.openTelegram(session, spaceId, routine.id);
  return { ...ticket, token: new URL(ticket.link).searchParams.get("start")! };
}
async function bot(
  user: number,
  text: string,
  extra: Record<string, unknown> = {},
  id = ++update,
  secret = "s".repeat(32),
) {
  const response = await handleTelegramRequest(
    new Request("https://nocturne.test/api/space/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
      body: JSON.stringify({
        update_id: id,
        message: { from: { id: user }, chat: { id: user, type: "private" }, text, ...extra },
      }),
    }),
    db,
  );
  return { response, value: await response.json() };
}
beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "example_test_bot");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s".repeat(32));
  now = new Date("2026-10-23T12:00:00Z");
  db = new SpaceRepository(":memory:", () => now);
  update = 0;
  const created = db.create("Master", "dom");
  master = created.token;
  spaceId = created.snapshot.state.space.id!;
  sub = db.join(created.snapshot.invite!.token, "Sub").token;
  command(master, { type: "routine.save", routine });
  command(master, { type: "agreement.ack" });
  command(sub, { type: "agreement.ack" });
});
afterEach(() => {
  db.close();
  vi.unstubAllEnvs();
});
it("records success only after distinct partners say yes and ignores duplicate webhook delivery", async () => {
  const m = open(master),
    s = open(sub);
  expect(m.ticketId).toBe(s.ticketId);
  await bot(101, `/start ${m.token}`);
  await bot(202, `/start ${s.token}`);
  const first = await bot(101, `/yes ${m.ticketId}`);
  expect(first.value.text).toContain("Waiting");
  expect(db.read(sub, spaceId).state.submissions).toHaveLength(0);
  const result = await bot(202, `/yes ${s.ticketId}`, {}, 100);
  expect(result.value.text).toContain("Proof submitted successfully");
  let snapshot = db.read(master, spaceId);
  expect(snapshot.state.submissions).toHaveLength(1);
  expect(Object.values(snapshot.state.tasks)[0]!.status).toBe("submitted");
  expect(snapshot.telegram.proofs[0]!.status).toBe("submitted");
  await bot(202, `/yes ${s.ticketId}`, {}, 100);
  snapshot = db.read(master, spaceId);
  expect(snapshot.state.submissions).toHaveLength(1);
  expect(JSON.stringify(snapshot)).not.toContain("user_id");
});
it("keeps file IDs, filenames and media URLs out of app records", async () => {
  const s = open(sub);
  await bot(202, `/start ${s.token}`);
  const result = await bot(202, "", {
    caption: `/proof ${s.ticketId}`,
    photo: [{ file_id: "private-file-id", file_unique_id: "hidden", width: 100, height: 100 }],
  });
  expect(result.value.text).toContain("Input received");
  const snapshot = db.read(master, spaceId);
  expect(snapshot.telegram.proofs[0]!.mediaReceived).toBe(true);
  expect(JSON.stringify(snapshot)).not.toMatch(/private-file-id|hidden|file_id/);
  expect(snapshot.state.submissions).toHaveLength(0);
});
it("rejects forged webhooks and unlinked users", async () => {
  const m = open(master);
  expect((await bot(101, `/start ${m.token}`, {}, 1, "wrong")).response.status).toBe(403);
  expect((await bot(999, `/yes ${m.ticketId}`)).value.text).toContain("personal link");
  expect(db.read(master, spaceId).telegram.proofs[0]!.masterConfirmed).toBe(false);
});
it("does not allow one Telegram account to confirm both sides", async () => {
  const m = open(master),
    s = open(sub);
  await bot(101, `/start ${m.token}`);
  expect((await bot(101, `/start ${s.token}`)).value.text).toContain("distinct Telegram accounts");
  await bot(101, `/yes ${m.ticketId}`);
  expect(db.read(master, spaceId).state.submissions).toHaveLength(0);
});
it("consumes personal links and cannot replace an established Telegram account", async () => {
  const m = open(master);
  await bot(101, `/start ${m.token}`);
  expect((await bot(999, `/start ${m.token}`)).value.text).toContain("unavailable");
  const fresh = open(master);
  expect((await bot(999, `/start ${fresh.token}`)).value.text).toContain("already linked");
});
it("locks binding, media and confirmations while paused", async () => {
  const m = open(master),
    s = open(sub);
  await bot(101, `/start ${m.token}`);
  command(master, { type: "pause", reason: "Stop" });
  const before = db.read(master, spaceId);
  for (const [user, text, extra] of [
    [202, `/start ${s.token}`, {}],
    [101, `/yes ${m.ticketId}`, {}],
    [101, "", { caption: `/proof ${m.ticketId}`, photo: [{}] }],
  ] as const)
    expect((await bot(user, text, extra)).value.text).toContain("Paused");
  expect(() => open(master)).toThrow(/Paused/);
  expect(db.read(master, spaceId)).toEqual(before);
});
it("a no prevents submission even after the other partner said yes", async () => {
  const m = open(master),
    s = open(sub);
  await bot(101, `/start ${m.token}`);
  await bot(202, `/start ${s.token}`);
  await bot(101, `/yes ${m.ticketId}`);
  await bot(202, `/no ${s.ticketId}`);
  expect((await bot(202, `/yes ${s.ticketId}`)).value.text).toContain("declined");
  expect(db.read(master, spaceId).state.submissions).toHaveLength(0);
});
it.each(["next day", "changed instructions"])("rejects confirmations after %s", async (mode) => {
  const m = open(master),
    s = open(sub);
  await bot(101, `/start ${m.token}`);
  await bot(202, `/start ${s.token}`);
  if (mode === "next day") now = new Date("2026-10-24T01:00:00Z");
  else command(master, { type: "routine.save", routine: { ...routine, instructions: "Changed" } });
  expect((await bot(101, `/yes ${m.ticketId}`)).value.text).toContain(
    "expired or its instructions changed",
  );
  expect(db.read(master, spaceId).state.submissions).toHaveLength(0);
});
it("keeps receipts isolated when one browser belongs to several relationships", () => {
  open(master);
  const other = db.create("Same master", "dom", master);
  expect(other.snapshot.telegram.proofs).toHaveLength(0);
  expect(other.snapshot.spaces).toHaveLength(2);
  expect(() => db.openTelegram(sub, other.snapshot.state.space.id!, routine.id)).toThrow(
    /memberships/,
  );
  expect(db.read(master, spaceId).telegram.proofs).toHaveLength(1);
});
it("requires the ordinary task consent and preparation rules", () => {
  command(master, { type: "routine.save", routine: { ...routine, optInDaily: true } });
  expect(() => open(master)).toThrow(/Opt in/);
  command(sub, { type: "task.prepare", id: routine.id, preparation: "optIn" });
  expect(open(master).link).toContain("https://t.me/");
});
it("disables collection when server setup is missing", () => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
  expect(db.read(master, spaceId).telegram.configured).toBe(false);
  expect(() => open(master)).toThrow(/not configured/);
});
