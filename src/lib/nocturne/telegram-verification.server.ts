// Two-person Telegram verification, shared by the local SQLite and remote libSQL storage.
// A task passes only when both people say yes. Either No marks it not performed.
// No answer by the end of the day leaves it not verified. Nothing is deducted automatically.
import { createHash, randomUUID } from "node:crypto";
import type { AsyncSql } from "./auth-core.server";
import { agreementReady, transition } from "./engine";
import { dateKey, taskKey } from "./logic";
import type { AppState, Role } from "./types";

export const VERIFY_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS telegram_answers (ticket_id TEXT NOT NULL, role TEXT NOT NULL, answer TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(ticket_id, role))",
  "CREATE TABLE IF NOT EXISTS telegram_proof_media (ticket_id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, message_id INTEGER NOT NULL)",
];

export type Answer = "yes" | "no";
/** One outgoing bot message. `buttons` = the record whose Yes/No buttons to attach. */
export type BotMessage = {
  chatId: string;
  text: string;
  buttons?: string;
  copy?: { chatId: string; messageId: number };
};
export type BotResult = { reply: string; buttons?: string; notify: BotMessage[] };
export type TelegramInput = {
  updateId: number;
  userId: string;
  text: string;
  media: boolean;
  messageId?: number;
  /** A tap on a Yes/No button. */
  answer?: { ticketId: string; value: Answer };
};
type Ticket = {
  id: string;
  space_id: string;
  routine_id: string;
  day: string;
  revision: number;
  status: string;
  expires: number;
  dom_yes: number;
  sub_yes: number;
  media: number;
};
type Load = (spaceId: string) => Promise<AppState>;
type Save = (spaceId: string, state: AppState) => Promise<void>;

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const other = (role: Role): Role => (role === "dom" ? "sub" : "dom");
const title = (state: AppState, ticket: Ticket) =>
  state.routines.find((routine) => routine.id === ticket.routine_id)?.title ?? "this task";
const finalMessage = (status: string) =>
  status === "verified"
    ? "Already verified by both. Check the app."
    : status === "not_performed"
      ? "Already marked not performed. Corrections happen in the app."
      : status === "submitted"
        ? "Proof submitted successfully. Both confirmed. Check the app."
        : "This record is closed. Start again in the app.";

/** Both said yes: submission, accepted review and the routine's reward, once, through the engine. */
export function completeVerified(state: AppState, ticket: Ticket, now: Date): AppState {
  const ctx = { now, id: randomUUID, random: () => 0 };
  const routine = state.routines.find((r) => r.id === ticket.routine_id)!;
  const as = (s: AppState, role: Role) => ({ ...s, myRole: role, viewRole: role });
  let next = transition(
    as(state, "sub"),
    { type: "submission", id: ticket.routine_id, text: "Verified by both on Telegram." },
    ctx,
  );
  const submission = next.submissions![0]!;
  next = transition(
    as(next, "dom"),
    {
      type: "review",
      id: submission.id,
      decision: "accepted",
      response: "Verified by both on Telegram.",
    },
    ctx,
  );
  const reward = routine.rewardPoints ?? 0;
  if (reward > 0 && agreementReady(next))
    next = transition(
      as(next, "dom"),
      {
        type: "points.award",
        entry: {
          id: `telegram-${ticket.id}`,
          kind: "reward",
          amount: reward,
          reason: `Verified by both on Telegram: ${routine.title}`,
          submissionId: submission.id,
        },
      },
      ctx,
    );
  return { ...next, myRole: state.myRole, viewRole: state.viewRole };
}

/** Either said no: the task is not performed. No points are applied automatically. */
export function markNotPerformed(state: AppState, ticket: Ticket, role: Role, now: Date): AppState {
  const at = now.toISOString(),
    key = taskKey(ticket.routine_id, ticket.day),
    who = state.names[role],
    name = title(state, ticket);
  return {
    ...state,
    tasks: {
      ...state.tasks,
      [key]: {
        ...state.tasks[key],
        status: "not_performed",
        note: `${who} said No on Telegram.`,
        updatedAt: at,
        by: role,
      },
    },
    submissions: (state.submissions ?? []).map((item) =>
      item.routineId === ticket.routine_id && item.date === ticket.day && item.status === "open"
        ? {
            ...item,
            status: "rejected",
            response: "Marked not performed on Telegram.",
            reviewedAt: at,
          }
        : item,
    ),
    activity: [
      {
        id: randomUUID(),
        at,
        by: role,
        text: `${who} said No on Telegram for “${name}”. Marked not performed; no points were applied.`,
      },
      ...state.activity,
    ].slice(0, 300),
  };
}

export class TelegramVerification {
  constructor(private db: AsyncSql) {}

  private async ticket(id: string) {
    return (await this.db.prepare("SELECT * FROM telegram_proofs WHERE id=?").get(id)) as
      Ticket | undefined;
  }
  private async linked(spaceId: string, role: Role) {
    const row = (await this.db
      .prepare("SELECT user_id FROM telegram_members WHERE space_id=? AND role=?")
      .get(spaceId, role)) as { user_id: string } | undefined;
    return row?.user_id;
  }
  private async answers(ticketId: string) {
    const rows = (await this.db
      .prepare("SELECT role, answer FROM telegram_answers WHERE ticket_id=?")
      .all(ticketId)) as { role: Role; answer: Answer }[];
    return {
      dom: rows.find((r) => r.role === "dom")?.answer,
      sub: rows.find((r) => r.role === "sub")?.answer,
    };
  }
  private async mark(updateId: number, now: Date) {
    if (updateId < 0) return;
    await this.db.prepare("INSERT INTO telegram_updates VALUES (?,?)").run(updateId, now.valueOf());
    await this.db
      .prepare("DELETE FROM telegram_updates WHERE at<?")
      .run(now.valueOf() - 8 * 24 * 60 * 60 * 1000);
  }
  /** Shared checks before any answer: pause, closed record, deadline and changed instructions. */
  private closed(state: AppState, ticket: Ticket, now: Date) {
    if (state.pause.active)
      return "Paused. Collection and confirmations are locked. Discuss and resume in the app first.";
    if (ticket.status !== "pending") return finalMessage(ticket.status);
    const routine = state.routines.find((r) => r.id === ticket.routine_id);
    if (
      ticket.expires <= now.valueOf() ||
      ticket.day !== dateKey(now, state.space.timeZone) ||
      !routine ||
      (routine.revision ?? 1) !== ticket.revision
    )
      return "This record expired or its instructions changed, so it is not verified. Start again in the app.";
    return "";
  }

  /** Records one person's answer and applies the outcome when it is decided. */
  private async answer(
    ticket: Ticket,
    role: Role,
    value: Answer,
    now: Date,
    load: Load,
    save: Save,
    updateId: number,
  ): Promise<BotResult> {
    const state = await load(ticket.space_id);
    const blocked = this.closed(state, ticket, now);
    if (blocked) return { reply: blocked, notify: [] };
    const given = await this.answers(ticket.id);
    if (given[role])
      return {
        reply: `You already answered ${given[role] === "yes" ? "Yes" : "No"}. Answers are final; corrections happen in the app.`,
        notify: [],
      };
    const name = title(state, ticket),
      me = state.names[role],
      them = state.names[other(role)],
      theirChat = await this.linked(ticket.space_id, other(role));
    if (value === "no") {
      await save(ticket.space_id, markNotPerformed(state, ticket, role, now));
      await this.db
        .prepare("INSERT INTO telegram_answers VALUES (?,?,?,?)")
        .run(ticket.id, role, "no", now.valueOf());
      await this.db
        .prepare("UPDATE telegram_proofs SET status='not_performed' WHERE id=?")
        .run(ticket.id);
      await this.mark(updateId, now);
      return {
        reply: `Recorded your No. “${name}” is marked not performed. No points were applied.`,
        notify: theirChat
          ? [
              {
                chatId: theirChat,
                text: `${me} said No for “${name}”. It is marked not performed.`,
              },
            ]
          : [],
      };
    }
    if (given[other(role)] === "yes") {
      let next: AppState;
      try {
        next = completeVerified(state, ticket, now);
      } catch (error) {
        return {
          reply: `Nothing was changed: ${error instanceof Error ? error.message : "this task can't be completed now."}`,
          notify: [],
        };
      }
      await save(ticket.space_id, next);
      await this.db
        .prepare("INSERT INTO telegram_answers VALUES (?,?,?,?)")
        .run(ticket.id, role, "yes", now.valueOf());
      await this.db
        .prepare("UPDATE telegram_proofs SET status='verified', dom_yes=1, sub_yes=1 WHERE id=?")
        .run(ticket.id);
      await this.mark(updateId, now);
      const routine = state.routines.find((r) => r.id === ticket.routine_id)!;
      const reward =
        (routine.rewardPoints ?? 0) > 0 && agreementReady(state)
          ? ` ${routine.rewardPoints} reward points were added.`
          : "";
      const done = `Both confirmed “${name}”. It is marked completed.${reward}`;
      return { reply: done, notify: theirChat ? [{ chatId: theirChat, text: done }] : [] };
    }
    await this.db
      .prepare("INSERT INTO telegram_answers VALUES (?,?,?,?)")
      .run(ticket.id, role, "yes", now.valueOf());
    await this.db
      .prepare(`UPDATE telegram_proofs SET ${role === "dom" ? "dom_yes" : "sub_yes"}=1 WHERE id=?`)
      .run(ticket.id);
    await this.mark(updateId, now);
    if (!theirChat)
      return {
        reply: `Your Yes is recorded. Waiting for ${them}, who can answer in the app. Nothing is completed yet.`,
        notify: [],
      };
    const media = (await this.db
      .prepare("SELECT chat_id, message_id FROM telegram_proof_media WHERE ticket_id=?")
      .get(ticket.id)) as { chat_id: string; message_id: number } | undefined;
    return {
      reply: `Your Yes is recorded. ${them} has been asked to confirm. Nothing is completed yet.`,
      notify: [
        {
          chatId: theirChat,
          text:
            role === "sub"
              ? `${me} says “${name}” is done. Did you verify it?`
              : `${me} confirmed “${name}”. Did you do it?`,
          buttons: ticket.id,
          ...(role === "sub" && media
            ? { copy: { chatId: media.chat_id, messageId: Number(media.message_id) } }
            : {}),
        },
      ],
    };
  }

  /** A Telegram update: /start link, /proof media, /status, or a Yes/No tap or command. */
  async process(input: TelegramInput, now: Date, load: Load, save: Save): Promise<BotResult> {
    if (await this.db.prepare("SELECT 1 FROM telegram_updates WHERE id=?").get(input.updateId))
      return { reply: "Update already received. Check the app for current status.", notify: [] };
    const start = /^\/start(?:@\w+)? ([a-f0-9]{48})$/.exec(input.text);
    const typed = /^\/(yes|no|proof|status)(?:@\w+)? ([a-f0-9-]{36})$/.exec(input.text);
    const action = input.answer
      ? { kind: input.answer.value as string, id: input.answer.ticketId }
      : typed
        ? { kind: typed[1]!, id: typed[2]! }
        : null;
    if (start) {
      const link = (await this.db
        .prepare("SELECT ticket_id, role FROM telegram_links WHERE token_hash=?")
        .get(digest(start[1]!))) as { ticket_id: string; role: Role } | undefined;
      if (!link)
        return { reply: "This link is unavailable. Open a fresh link from your app.", notify: [] };
      const ticket = (await this.ticket(link.ticket_id))!;
      const state = await load(ticket.space_id);
      const blocked = this.closed(state, ticket, now);
      if (blocked) return { reply: blocked, notify: [] };
      const existing = await this.linked(ticket.space_id, link.role);
      if (existing && existing !== input.userId)
        return {
          reply: "This participant is already linked to another Telegram account.",
          notify: [],
        };
      const mine = (await this.db
        .prepare("SELECT role FROM telegram_members WHERE space_id=? AND user_id=?")
        .get(ticket.space_id, input.userId)) as { role: Role } | undefined;
      if (mine && mine.role !== link.role)
        return { reply: "Two distinct Telegram accounts are required for this space.", notify: [] };
      await this.db
        .prepare("INSERT OR IGNORE INTO telegram_members VALUES (?,?,?)")
        .run(ticket.space_id, link.role, input.userId);
      await this.db.prepare("DELETE FROM telegram_links WHERE token_hash=?").run(digest(start[1]!));
      await this.mark(input.updateId, now);
      const name = title(state, ticket);
      return {
        reply:
          link.role === "sub"
            ? `Record for “${name}”. Optionally send a photo with the caption /proof ${ticket.id}. Then tap Yes if you did it, or No if you didn't. Both of you must say yes for it to pass.\nReference ${ticket.id}`
            : `Record for “${name}”. Tap Yes once you have verified it, or No if it wasn't done. Both of you must say yes for it to pass.\nReference ${ticket.id}`,
        buttons: ticket.id,
        notify: [],
      };
    }
    if (!action)
      return {
        reply:
          "Open your personal record link from the app, then use the Yes and No buttons. You can also type /yes RECORD, /no RECORD or /status RECORD.",
        notify: [],
      };
    const ticket = await this.ticket(action.id);
    if (!ticket) return { reply: "Record unavailable.", notify: [] };
    const member = (await this.db
      .prepare("SELECT role FROM telegram_members WHERE space_id=? AND user_id=?")
      .get(ticket.space_id, input.userId)) as { role: Role } | undefined;
    if (!member) return { reply: "Open your personal link from the app first.", notify: [] };
    const state = await load(ticket.space_id);
    if (action.kind === "status") {
      const given = await this.answers(ticket.id);
      const word = (a?: Answer) => (a === "yes" ? "yes" : a === "no" ? "no" : "waiting");
      return {
        reply: `“${title(state, ticket)}”: ${state.names.dom} ${word(given.dom)}; ${state.names.sub} ${word(given.sub)}.`,
        notify: [],
      };
    }
    if (action.kind === "proof") {
      const blocked = this.closed(state, ticket, now);
      if (blocked) return { reply: blocked, notify: [] };
      if (!input.media || input.messageId === undefined)
        return {
          reply: "Attach a photo with this caption, or just tap Yes for a text-only check-in.",
          notify: [],
        };
      await this.db.prepare("UPDATE telegram_proofs SET media=1 WHERE id=?").run(ticket.id);
      await this.db
        .prepare("INSERT OR REPLACE INTO telegram_proof_media VALUES (?,?,?)")
        .run(ticket.id, input.userId, input.messageId);
      await this.mark(input.updateId, now);
      return {
        reply:
          "Photo noted. It stays in Telegram; the app does not download it. Now tap Yes or No.",
        buttons: ticket.id,
        notify: [],
      };
    }
    return this.answer(ticket, member.role, action.kind as Answer, now, load, save, input.updateId);
  }

  /** The same Yes/No, given in the app by a signed-in member of this relationship. */
  async answerInApp(
    spaceId: string,
    role: Role,
    ticketId: string,
    value: Answer,
    now: Date,
    load: Load,
    save: Save,
  ): Promise<BotResult> {
    const ticket = await this.ticket(ticketId);
    if (!ticket || ticket.space_id !== spaceId) return { reply: "Record unavailable.", notify: [] };
    return this.answer(ticket, role, value, now, load, save, -1);
  }

  /** Records for the app, with each person's answer and "not verified" once the day has passed. */
  async list(spaceId: string, now: Date, today: string) {
    const tickets = (await this.db
      .prepare("SELECT * FROM telegram_proofs WHERE space_id=? ORDER BY rowid DESC LIMIT 30")
      .all(spaceId)) as Ticket[];
    const answers = (await this.db
      .prepare(
        "SELECT ticket_id, role, answer FROM telegram_answers WHERE ticket_id IN (SELECT id FROM telegram_proofs WHERE space_id=?)",
      )
      .all(spaceId)) as { ticket_id: string; role: Role; answer: Answer }[];
    return tickets.map((t) => {
      const of = (role: Role) =>
        answers.find((a) => a.ticket_id === t.id && a.role === role)?.answer ??
        (t[role === "dom" ? "dom_yes" : "sub_yes"] ? "yes" : null);
      const late = t.expires <= now.valueOf() || t.day !== today;
      return {
        id: t.id,
        routineId: t.routine_id,
        date: t.day,
        status: t.status === "pending" && late ? "not_verified" : t.status,
        masterConfirmed: of("dom") === "yes",
        subConfirmed: of("sub") === "yes",
        masterAnswer: of("dom"),
        subAnswer: of("sub"),
        mediaReceived: !!t.media,
      };
    });
  }
}
