import type { Role } from "../types";
import { drawCard } from "./deck";
import {
  FREE_SKIPS_PER_PERSON,
  type DealContext,
  type GameCard,
  type GameId,
  type GameSession,
  type Heat,
  type Result,
} from "./types";

const fail = (error: string): Result<GameSession> => ({ ok: false, error });
const ok = (value: GameSession): Result<GameSession> => ({ ok: true, value });

export function createSession(
  id: string,
  game: GameId,
  heat: Heat,
  masterOnlyRoll = false,
): GameSession {
  return {
    id,
    game,
    masterOnlyRoll,
    heat,
    status: "lobby",
    joined: { dom: false, sub: false },
    turn: null,
    skips: { dom: FREE_SKIPS_PER_PERSON, sub: FREE_SKIPS_PER_PERSON },
    currentCard: null,
    seen: [],
  };
}

/** Both people opt in. The game starts only when both have joined. */
export function join(session: GameSession, role: Role): Result<GameSession> {
  if (session.status === "stopped") return fail("This game has ended.");
  if (session.joined[role]) return ok(session);
  const joined = { ...session.joined, [role]: true };
  const both = joined.dom && joined.sub;
  return ok({
    ...session,
    joined,
    status: both ? "active" : session.status,
    turn: both ? "dom" : session.turn,
  });
}

/** Either person can end the game at any time. RED ends it at once and is recorded as such. */
export function stop(
  session: GameSession,
  role: Role,
  reason: "stop" | "red" = "stop",
): GameSession {
  if (session.status === "stopped") return session;
  return { ...session, status: "stopped", currentCard: null, stoppedBy: role, stopReason: reason };
}

export function red(session: GameSession, role: Role): GameSession {
  return stop(session, role, "red");
}

/** The other person takes the next turn. */
export function nextTurn(session: GameSession): Result<GameSession> {
  if (session.status !== "active" || !session.turn) return fail("The game isn't running.");
  return ok({ ...session, turn: session.turn === "dom" ? "sub" : "dom", currentCard: null });
}

/** Deal a card to the person whose turn it is. */
export function deal(
  session: GameSession,
  deck: GameCard[],
  ctx: Omit<DealContext, "heat">,
  rng: () => number = Math.random,
): Result<GameSession> {
  if (session.status !== "active") return fail("Both people need to join before cards are dealt.");
  if (session.currentCard) return fail("Finish or skip the current card first.");
  const draw = drawCard(deck, { ...ctx, heat: session.heat }, session.seen, rng);
  if (!draw) return fail("No card is available at this heat level.");
  return ok({ ...session, currentCard: draw.card, seen: draw.seen });
}

/** Spend one of the person's two free skips on the current card. A skip never costs points. */
export function skip(session: GameSession, role: Role): Result<GameSession> {
  if (session.status !== "active") return fail("The game isn't running.");
  if (!session.currentCard) return fail("There's no card to skip.");
  if (session.skips[role] <= 0) return fail("No free skips left.");
  return ok({
    ...session,
    currentCard: null,
    skips: { ...session.skips, [role]: session.skips[role] - 1 },
  });
}

/** YELLOW skips the current card for free; it doesn't use up a skip. */
export function yellow(session: GameSession): Result<GameSession> {
  if (session.status !== "active") return fail("The game isn't running.");
  if (!session.currentCard) return fail("There's no card to skip.");
  return ok({ ...session, currentCard: null });
}

/** The card was done. Clears it so the next turn can start. */
export function complete(session: GameSession): Result<GameSession> {
  if (session.status !== "active") return fail("The game isn't running.");
  if (!session.currentCard) return fail("There's no card to finish.");
  return ok({ ...session, currentCard: null });
}
