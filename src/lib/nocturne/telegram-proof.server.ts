import type { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { dateKey } from "./logic";
import { transition } from "./engine";
import type { AppState, Role } from "./types";

export const telegramConfigured = () =>
  /^[a-zA-Z0-9_]{5,32}$/.test(process.env["TELEGRAM_BOT_USERNAME"] ?? "") &&
  (process.env["TELEGRAM_WEBHOOK_SECRET"]?.length ?? 0) >= 32;
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export type ProofTicket = {
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
export class TelegramProofStore {
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS telegram_proofs (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), routine_id TEXT NOT NULL, day TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, expires INTEGER NOT NULL, dom_yes INTEGER NOT NULL DEFAULT 0, sub_yes INTEGER NOT NULL DEFAULT 0, media INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS telegram_links (token_hash TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES telegram_proofs(id), role TEXT NOT NULL, UNIQUE(ticket_id,role));
      CREATE TABLE IF NOT EXISTS telegram_members (space_id TEXT NOT NULL REFERENCES spaces(id), role TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(space_id,role), UNIQUE(space_id,user_id));
      CREATE TABLE IF NOT EXISTS telegram_updates (id INTEGER PRIMARY KEY, at INTEGER NOT NULL);`);
  }
  list(spaceId: string, now: Date) {
    return (
      this.db
        .prepare("SELECT * FROM telegram_proofs WHERE space_id=? ORDER BY rowid DESC LIMIT 30")
        .all(spaceId) as ProofTicket[]
    ).map((p) => ({
      id: p.id,
      routineId: p.routine_id,
      date: p.day,
      status: p.status === "pending" && p.expires <= now.valueOf() ? "expired" : p.status,
      masterConfirmed: !!p.dom_yes,
      subConfirmed: !!p.sub_yes,
      mediaReceived: !!p.media,
    }));
  }
  open(state: AppState, role: Role, now: Date) {
    if (!telegramConfigured()) throw new Error("Telegram is not configured on this server yet.");
    if (state.pause.active) throw new Error("Paused: proof collection is locked.");
    if (!state.space.paired) throw new Error("Both people must join first.");
    return (routineId: string) => {
      const routine = state.routines.find((r) => r.id === routineId);
      if (!routine || routine.proof === "challenge")
        throw new Error("Use the written prompt flow for this routine.");
      // Check the same consent, schedule and preparation rules as an ordinary submission.
      transition(
        { ...state, viewRole: "sub" },
        {
          type: "submission",
          id: routineId,
          text: "Telegram proof submitted successfully. Both participants confirmed receipt. Media remains in Telegram.",
        },
        { now, id: randomUUID, random: () => 0 },
      );
      const day = dateKey(now, state.space.timeZone);
      let ticket = this.db
        .prepare(
          "SELECT * FROM telegram_proofs WHERE space_id=? AND routine_id=? AND day=? AND revision=? AND status='pending' AND expires>? ORDER BY rowid DESC LIMIT 1",
        )
        .get(state.space.id!, routineId, day, routine.revision ?? 1, now.valueOf()) as
        ProofTicket | undefined;
      if (!ticket) {
        const id = randomUUID();
        this.db
          .prepare(
            "INSERT INTO telegram_proofs (id,space_id,routine_id,day,revision,status,expires) VALUES (?,?,?,?,?,'pending',?)",
          )
          .run(
            id,
            state.space.id!,
            routineId,
            day,
            routine.revision ?? 1,
            now.valueOf() + 24 * 60 * 60 * 1000,
          );
        ticket = this.db.prepare("SELECT * FROM telegram_proofs WHERE id=?").get(id) as ProofTicket;
      }
      const token = randomBytes(24).toString("hex");
      this.db
        .prepare("DELETE FROM telegram_links WHERE ticket_id=? AND role=?")
        .run(ticket.id, role);
      this.db
        .prepare("INSERT INTO telegram_links VALUES (?,?,?)")
        .run(digest(token), ticket.id, role);
      return {
        ticketId: ticket.id,
        link: `https://t.me/${process.env["TELEGRAM_BOT_USERNAME"]}?start=${token}`,
      };
    };
  }
  process(
    updateId: number,
    userId: string,
    text: string,
    media: boolean,
    now: Date,
    getState: (id: string) => AppState,
    save: (id: string, state: AppState) => void,
  ) {
    if (this.db.prepare("SELECT 1 FROM telegram_updates WHERE id=?").get(updateId))
      return "Update already received. Check the app for current status.";
    const start = /^\/start(?:@\w+)? ([a-f0-9]{48})$/.exec(text);
    const action = /^\/(yes|no|proof|status)(?:@\w+)? ([a-f0-9-]{36})$/.exec(text);
    let role: Role, ticket: ProofTicket;
    if (start) {
      const link = this.db
        .prepare("SELECT ticket_id,role FROM telegram_links WHERE token_hash=?")
        .get(digest(start[1]!)) as { ticket_id: string; role: Role } | undefined;
      if (!link) return "This link is unavailable. Open a fresh link from your app.";
      ticket = this.db
        .prepare("SELECT * FROM telegram_proofs WHERE id=?")
        .get(link.ticket_id) as ProofTicket;
      role = link.role;
    } else if (action) {
      const found = this.db.prepare("SELECT * FROM telegram_proofs WHERE id=?").get(action[2]!) as
        ProofTicket | undefined;
      if (!found) return "Record unavailable.";
      ticket = found;
      const member = this.db
        .prepare("SELECT role FROM telegram_members WHERE space_id=? AND user_id=?")
        .get(ticket.space_id, userId) as { role: Role } | undefined;
      if (!member) return "Open your personal link from the app first.";
      role = member.role;
    } else
      return "Open your personal record link from the app. Use /yes RECORD, /no RECORD, or /status RECORD. Optional media can include /proof RECORD as its caption.";
    const state = getState(ticket.space_id);
    if (state.pause.active)
      return "Paused. Collection and confirmations are locked. Discuss and resume in the app first.";
    if (ticket.status !== "pending")
      return ticket.status === "submitted"
        ? "Proof submitted successfully. Both confirmed. Check the app."
        : "This record was declined. Use the app to start again.";
    const routine = state.routines.find((r) => r.id === ticket.routine_id);
    if (
      ticket.expires <= now.valueOf() ||
      ticket.day !== dateKey(now, state.space.timeZone) ||
      !routine ||
      (routine.revision ?? 1) !== ticket.revision
    )
      return "This record expired or its instructions changed. Start again in the app.";
    const mark = () => {
      this.db.prepare("INSERT INTO telegram_updates VALUES (?,?)").run(updateId, now.valueOf());
      this.db
        .prepare("DELETE FROM telegram_updates WHERE at<?")
        .run(now.valueOf() - 8 * 24 * 60 * 60 * 1000);
    };
    if (start) {
      const member = this.db
        .prepare("SELECT user_id FROM telegram_members WHERE space_id=? AND role=?")
        .get(ticket.space_id, role) as { user_id: string } | undefined;
      if (member && member.user_id !== userId)
        return "This participant is already linked to another Telegram account.";
      const other = this.db
        .prepare("SELECT role FROM telegram_members WHERE space_id=? AND user_id=?")
        .get(ticket.space_id, userId) as { role: Role } | undefined;
      if (other && other.role !== role)
        return "Two distinct Telegram accounts are required for this space.";
      this.db
        .prepare("INSERT OR IGNORE INTO telegram_members VALUES (?,?,?)")
        .run(ticket.space_id, role, userId);
      this.db.prepare("DELETE FROM telegram_links WHERE token_hash=?").run(digest(start[1]!));
      mark();
      return `Record ${ticket.id}. Share optional proof in your agreed Telegram conversation. To confirm receipt use /yes ${ticket.id}. To decline use /no ${ticket.id}. Check status with /status ${ticket.id}.`;
    }
    if (action![1] === "status")
      return `Record ${ticket.id}: ${ticket.dom_yes ? "Master yes" : "Master pending"}; ${ticket.sub_yes ? "Sub yes" : "Sub pending"}.`;
    if (action![1] === "proof") {
      if (!media)
        return "Attach media with this caption, or use /yes RECORD for a text alternative.";
      this.db.prepare("UPDATE telegram_proofs SET media=1 WHERE id=?").run(ticket.id);
      mark();
      return "Input received in Telegram. No media was downloaded by the app. Both confirmations are still required.";
    }
    if (action![1] === "no") {
      this.db.prepare("UPDATE telegram_proofs SET status='declined' WHERE id=?").run(ticket.id);
      mark();
      return "Declined. Nothing has been submitted to the app.";
    }
    const domYes = role === "dom" || !!ticket.dom_yes,
      subYes = role === "sub" || !!ticket.sub_yes;
    if (domYes && subYes) {
      const next = transition(
        { ...state, viewRole: "sub" },
        {
          type: "submission",
          id: ticket.routine_id,
          text: "Telegram proof submitted successfully. Both participants confirmed receipt. Media remains in Telegram.",
        },
        { now, id: randomUUID, random: () => 0 },
      );
      save(ticket.space_id, next);
      this.db
        .prepare("UPDATE telegram_proofs SET status='submitted',dom_yes=1,sub_yes=1 WHERE id=?")
        .run(ticket.id);
      mark();
      return "Proof submitted successfully. Both participants confirmed. Check the app; this is a receipt, not independent verification.";
    }
    this.db
      .prepare(
        role === "dom"
          ? "UPDATE telegram_proofs SET dom_yes=1 WHERE id=?"
          : "UPDATE telegram_proofs SET sub_yes=1 WHERE id=?",
      )
      .run(ticket.id);
    mark();
    return "Your yes is recorded. Waiting for the other participant. Nothing has been submitted yet.";
  }
}
