import type { RemoteSql } from "./remote-storage.server";
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
export class RemoteTelegramProofStore {
  constructor(private db: RemoteSql) {}
  open(state: AppState, role: Role, now: Date) {
    if (!telegramConfigured()) throw new Error("Telegram is not configured on this server yet.");
    if (state.pause.active) throw new Error("Paused: proof collection is locked.");
    if (!state.space.paired) throw new Error("Both people must join first.");
    return async (routineId: string) => {
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
      let ticket = (await this.db
        .prepare(
          "SELECT * FROM telegram_proofs WHERE space_id=? AND routine_id=? AND day=? AND revision=? AND status='pending' AND expires>? ORDER BY rowid DESC LIMIT 1",
        )
        .get(state.space.id!, routineId, day, routine.revision ?? 1, now.valueOf())) as
        ProofTicket | undefined;
      if (!ticket) {
        const id = randomUUID();
        await this.db
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
        ticket = (await this.db
          .prepare("SELECT * FROM telegram_proofs WHERE id=?")
          .get(id)) as unknown as ProofTicket;
      }
      const token = randomBytes(24).toString("hex");
      await this.db
        .prepare("DELETE FROM telegram_links WHERE ticket_id=? AND role=?")
        .run(ticket.id, role);
      await this.db
        .prepare("INSERT INTO telegram_links VALUES (?,?,?)")
        .run(digest(token), ticket.id, role);
      return {
        ticketId: ticket.id,
        link: `https://t.me/${process.env["TELEGRAM_BOT_USERNAME"]}?start=${token}`,
      };
    };
  }
}
