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
  /** Same shape as TelegramVerification.list, for the synchronous local snapshot. */
  list(spaceId: string, now: Date, today: string) {
    const tickets = this.db
      .prepare("SELECT * FROM telegram_proofs WHERE space_id=? ORDER BY rowid DESC LIMIT 30")
      .all(spaceId) as ProofTicket[];
    const answers = this.db
      .prepare(
        "SELECT ticket_id, role, answer FROM telegram_answers WHERE ticket_id IN (SELECT id FROM telegram_proofs WHERE space_id=?)",
      )
      .all(spaceId) as { ticket_id: string; role: Role; answer: "yes" | "no" }[];
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
  open(state: AppState, role: Role, now: Date) {
    if (!telegramConfigured()) throw new Error("Telegram is not configured on this server yet.");
    if (state.pause.active) throw new Error("Paused: proof collection is locked.");
    if (!state.space.paired) throw new Error("Both people must join first.");
    return (routineId: string) => {
      const routine = state.routines.find((r) => r.id === routineId);
      if (!routine || routine.proof === "challenge")
        throw new Error("Use the written prompt flow for this routine.");
      if (!routine.telegramVerify)
        throw new Error("Turn on Verify on Telegram for this routine first.");
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
}
