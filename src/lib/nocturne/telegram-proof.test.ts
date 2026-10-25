// @vitest-environment node
// Two-person Telegram verification: every case from the spec, on both storages,
// through the real webhook handler with simulated Telegram updates and a fake Bot API.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { SpaceRepository } from "./space-repository.server";
import { RemoteSpaceRepository, type SpaceStorage } from "./remote-storage.server";
import { handleTelegramRequest } from "./space-api.server";
import { ApiBrowser } from "./api-browser.test-helper";
import type { Routine } from "./types";

const SECRET = "s".repeat(32),
  MASTER_TG = 101,
  SUB_TG = 202;
let directory: string, clock: Date, db: SpaceStorage & { close(): void }, update: number;
let sent: { method: string; body: Record<string, unknown> }[];
const routine: Routine = {
  id: "stretch",
  title: "Morning stretch",
  instructions: "Ten minutes.",
  windowStart: "00:00",
  windowEnd: "23:59",
  recurrence: { kind: "daily" },
  reminderMinutes: null,
  enabled: true,
  requiresAck: false,
  optInDaily: false,
  proof: "text",
  telegramVerify: true,
  rewardPoints: 10,
};

async function webhook(body: Record<string, unknown>, secret = SECRET) {
  const response = await handleTelegramRequest(
    new Request("https://boundsome.test/api/space/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
      body: JSON.stringify(body),
    }),
    db,
  );
  return { status: response.status, value: await response.json() };
}
/** A typed message in someone's private chat with the bot. */
const say = (user: number, text: string, extra: Record<string, unknown> = {}, id = ++update) =>
  webhook({
    update_id: id,
    message: {
      message_id: id,
      from: { id: user },
      chat: { id: user, type: "private" },
      text,
      ...extra,
    },
  });
/** A tap on the Yes/No buttons. */
const tap = (
  user: number,
  ticketId: string,
  value: "y" | "n",
  id = ++update,
  chatType = "private",
) =>
  webhook({
    update_id: id,
    callback_query: {
      id: `cb-${id}`,
      from: { id: user },
      data: `${value}:${ticketId}`,
      message: { chat: { id: user, type: chatType } },
    },
  });

async function setup(withRoutine: Routine = routine) {
  const master = new ApiBrowser(() => db, "203.0.113.1"),
    sub = new ApiBrowser(() => db, "198.51.100.1");
  await master.register("nina@example.test", "Nina");
  await sub.register("tara@example.test", "Tara");
  const created = await master.create("Nina");
  const spaceId = created.body.state.space.id as string;
  await sub.join(created.body.invite.token, "Tara");
  await master.command(spaceId, { type: "agreement.ack" });
  await sub.command(spaceId, { type: "agreement.ack" });
  await master.command(spaceId, { type: "routine.save", routine: withRoutine });
  const open = async (person: ApiBrowser) => {
    const opened = await person.call({ op: "telegram.open", spaceId, routineId: withRoutine.id });
    return {
      status: opened.status,
      ticketId: opened.body.ticketId as string,
      token: opened.body.link ? new URL(opened.body.link).searchParams.get("start")! : "",
    };
  };
  const m = await open(master),
    s = await open(sub);
  const state = async () => (await master.open(spaceId)).body;
  return { master, sub, spaceId, m, s, open, state, ticketId: m.ticketId };
}
async function linked() {
  const ctx = await setup();
  await say(MASTER_TG, `/start ${ctx.m.token}`);
  await say(SUB_TG, `/start ${ctx.s.token}`);
  return ctx;
}
const task = (snapshot: { state: { tasks: Record<string, { status: string }> } }) =>
  snapshot.state.tasks["stretch:2026-10-25"]?.status;
const rewards = (snapshot: {
  state: { points: { ledger: { kind: string; voidedAt?: string }[] } };
}) => snapshot.state.points.ledger.filter((e) => e.kind === "reward" && !e.voidedAt).length;

for (const backend of ["local SQLite", "remote libSQL"] as const) {
  describe(`Telegram two-person verification (${backend})`, () => {
    beforeEach(() => {
      vi.stubEnv("TELEGRAM_BOT_USERNAME", "boundsome_test_bot");
      vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456789:" + "t".repeat(35));
      sent = [];
      vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
        sent.push({ method: url.split("/").at(-1)!, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });
      update = 0;
      directory = mkdtempSync(join(tmpdir(), "boundsome-telegram-"));
      clock = new Date("2026-10-25T06:00:00Z");
      db =
        backend === "local SQLite"
          ? new SpaceRepository(join(directory, "s.sqlite"), () => clock)
          : new RemoteSpaceRepository(
              createClient({ url: `file:${join(directory, "r.sqlite")}` }),
              () => clock,
            );
    });
    afterEach(() => {
      db.close();
      rmSync(directory, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("both yes: completes the task, adds the reward once and asks the Master first", async () => {
      const { ticketId, state } = await linked();
      sent = [];
      const subYes = await tap(SUB_TG, ticketId, "y");
      expect(subYes.value).toMatchObject({ method: "answerCallbackQuery" });
      expect(subYes.value.text).toContain("Nina has been asked to confirm");
      const ask = sent.find(
        (c) => c.method === "sendMessage" && c.body["chat_id"] === String(MASTER_TG),
      );
      expect(ask?.body["text"]).toBe("Tara says “Morning stretch” is done. Did you verify it?");
      expect(ask?.body["reply_markup"]).toMatchObject({
        inline_keyboard: [[{ callback_data: `y:${ticketId}` }, { callback_data: `n:${ticketId}` }]],
      });
      expect(task(await state())).toBeUndefined();
      const masterYes = await tap(MASTER_TG, ticketId, "y");
      expect(masterYes.value.text).toContain("marked completed. 10 reward points were added.");
      const after = await state();
      expect(task(after)).toBe("completed");
      expect(after.state.submissions[0]).toMatchObject({ status: "accepted" });
      expect(rewards(after)).toBe(1);
      expect(after.state.points.ledger[0]).toMatchObject({ amount: 10, kind: "reward" });
      expect(after.telegram.proofs[0]).toMatchObject({
        status: "verified",
        masterAnswer: "yes",
        subAnswer: "yes",
      });
      // The Sub is told the result too.
      expect(
        sent.some(
          (c) =>
            c.body["chat_id"] === String(SUB_TG) &&
            String(c.body["text"]).includes("Both confirmed"),
        ),
      ).toBe(true);
    });

    it("Master no, then Sub yes: not performed, no points", async () => {
      const { ticketId, state } = await linked();
      expect((await tap(MASTER_TG, ticketId, "n")).value.text).toContain("marked not performed");
      expect((await tap(SUB_TG, ticketId, "y")).value.text).toContain(
        "Already marked not performed",
      );
      const after = await state();
      expect(task(after)).toBe("not_performed");
      expect(rewards(after)).toBe(0);
      expect(after.state.points.ledger).toHaveLength(0);
    });

    it("Sub no, then Master yes: not performed, no points", async () => {
      const { ticketId, state } = await linked();
      await tap(SUB_TG, ticketId, "n");
      expect((await tap(MASTER_TG, ticketId, "y")).value.text).toContain(
        "Already marked not performed",
      );
      const after = await state();
      expect(task(after)).toBe("not_performed");
      expect(after.state.points.ledger).toHaveLength(0);
      expect(after.state.activity[0].text).toContain("Tara said No on Telegram");
    });

    it("Master yes, then Sub no: not performed and the reward is never added", async () => {
      const { ticketId, state } = await linked();
      await tap(MASTER_TG, ticketId, "y");
      await tap(SUB_TG, ticketId, "n");
      const after = await state();
      expect(task(after)).toBe("not_performed");
      expect(after.state.points.ledger).toHaveLength(0);
    });

    it("both no: not performed", async () => {
      const { ticketId, state } = await linked();
      await tap(SUB_TG, ticketId, "n");
      await tap(MASTER_TG, ticketId, "n");
      expect(task(await state())).toBe("not_performed");
    });

    it("answers are final", async () => {
      const { ticketId } = await linked();
      await tap(SUB_TG, ticketId, "y");
      expect((await tap(SUB_TG, ticketId, "n")).value.text).toContain("You already answered Yes");
    });

    it("counts a repeated Telegram update once, so the reward is added once", async () => {
      const { ticketId, state } = await linked();
      await tap(SUB_TG, ticketId, "y");
      await tap(MASTER_TG, ticketId, "y", 500);
      expect((await tap(MASTER_TG, ticketId, "y", 500)).value.text).toContain("already received");
      expect(rewards(await state())).toBe(1);
    });

    it("no answer by the end of the day: not verified, no points", async () => {
      const { ticketId, state } = await linked();
      await tap(SUB_TG, ticketId, "y");
      clock = new Date("2026-10-25T19:00:00Z"); // 00:30 next day in India
      expect((await tap(MASTER_TG, ticketId, "y")).value.text).toContain("not verified");
      const after = await state();
      expect(after.telegram.proofs[0].status).toBe("not_verified");
      expect(after.state.points.ledger).toHaveLength(0);
    });

    it("refuses answers while paused and changes nothing", async () => {
      const { ticketId, sub, spaceId, state } = await linked();
      await sub.command(spaceId, { type: "pause", reason: "Stop", signal: "RED" });
      const before = (await state()).state;
      expect((await tap(MASTER_TG, ticketId, "y")).value.text).toContain("Paused");
      expect((await tap(SUB_TG, ticketId, "n")).value.text).toContain("Paused");
      expect((await state()).state).toEqual(before);
    });

    it("closes the record when the routine changes mid-way", async () => {
      const { ticketId, master, spaceId } = await linked();
      await tap(SUB_TG, ticketId, "y");
      await master.command(spaceId, {
        type: "routine.save",
        routine: { ...routine, instructions: "Twenty minutes now.", revision: 1 },
      });
      expect((await tap(MASTER_TG, ticketId, "y")).value.text).toContain("instructions changed");
    });

    it("refuses a Telegram account that isn't linked to this relationship", async () => {
      const { ticketId, state } = await linked();
      expect((await tap(999, ticketId, "y")).value.text).toContain("Open your personal link");
      expect((await state()).telegram.proofs[0].masterAnswer).toBeNull();
    });

    it("refuses one Telegram account answering as both people", async () => {
      const ctx = await setup();
      await say(MASTER_TG, `/start ${ctx.m.token}`);
      expect((await say(MASTER_TG, `/start ${ctx.s.token}`)).value.text).toContain(
        "Two distinct Telegram accounts",
      );
    });

    it("ignores group chats completely", async () => {
      const { ticketId, state } = await linked();
      const group = await webhook({
        update_id: ++update,
        message: {
          from: { id: SUB_TG },
          chat: { id: -5000, type: "group" },
          text: `/yes ${ticketId}`,
        },
      });
      expect(group.value).toEqual({ ok: true });
      await tap(SUB_TG, ticketId, "y", ++update, "supergroup");
      expect((await state()).telegram.proofs[0].subAnswer).toBeNull();
    });

    it("lets the Master reverse an automatic reward in the app, with a reason", async () => {
      const { ticketId, master, spaceId, state } = await linked();
      await tap(SUB_TG, ticketId, "y");
      await tap(MASTER_TG, ticketId, "y");
      const entry = (await state()).state.points.ledger[0];
      await master.command(spaceId, {
        type: "points.adjust",
        id: entry.id,
        action: "void",
        note: "Counted twice by mistake",
      });
      const after = await state();
      expect(rewards(after)).toBe(0);
      expect(after.state.points.ledger[0].voidedAt).toBeTruthy();
    });

    it("accepts the answer in the app and tells the other person on Telegram", async () => {
      const { ticketId, master, sub, spaceId, state } = await linked();
      await tap(SUB_TG, ticketId, "y");
      sent = [];
      const viaApp = await master.call({ op: "telegram.answer", spaceId, ticketId, answer: "yes" });
      expect(viaApp.body.message).toContain("marked completed");
      expect(task(await state())).toBe("completed");
      expect(sent.some((c) => c.body["chat_id"] === String(SUB_TG))).toBe(true);
      // Someone outside the relationship can't answer through the app.
      const outsider = new ApiBrowser(() => db, "192.0.2.1");
      await outsider.register("zed@example.test");
      expect(
        (await outsider.call({ op: "telegram.answer", spaceId, ticketId, answer: "no" })).status,
      ).toBeGreaterThanOrEqual(400);
      expect(
        (await sub.call({ op: "telegram.answer", spaceId, ticketId, answer: "no" })).body.message,
      ).toContain("Already verified");
    });

    it("copies the Sub's photo to the Master with forwarding blocked, and stores no file details", async () => {
      const { ticketId, state } = await linked();
      const proof = await say(SUB_TG, "", {
        caption: `/proof ${ticketId}`,
        photo: [{ file_id: "private-file-id", file_unique_id: "hidden" }],
      });
      expect(proof.value.text).toContain("Photo noted");
      sent = [];
      await tap(SUB_TG, ticketId, "y");
      const copy = sent.find((c) => c.method === "copyMessage");
      expect(copy?.body).toMatchObject({
        chat_id: String(MASTER_TG),
        from_chat_id: String(SUB_TG),
        protect_content: true,
      });
      const snapshot = await state();
      expect(snapshot.telegram.proofs[0].mediaReceived).toBe(true);
      expect(JSON.stringify(snapshot)).not.toMatch(/private-file-id|hidden|file_id/);
    });

    it("requires Verify on Telegram on the routine before opening a record", async () => {
      const ctx = await setup({ ...routine, id: "plain", telegramVerify: false });
      expect(ctx.m.status).toBe(400);
    });

    it("rejects forged webhooks and consumes personal links", async () => {
      const { m } = await setup();
      expect((await webhook({ update_id: 1 }, "wrong".repeat(7))).status).toBe(403);
      await say(MASTER_TG, `/start ${m.token}`);
      expect((await say(999, `/start ${m.token}`)).value.text).toContain("unavailable");
    });

    it("tells the person to use the app when the other one hasn't linked Telegram", async () => {
      const ctx = await setup();
      await say(SUB_TG, `/start ${ctx.s.token}`);
      sent = [];
      expect((await tap(SUB_TG, ctx.ticketId, "y")).value.text).toContain("can answer in the app");
      expect(sent.filter((c) => c.body["chat_id"] === String(MASTER_TG))).toHaveLength(0);
    });
  });
}
