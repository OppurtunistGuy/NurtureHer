import type { Role } from "../types";
import { drawCard } from "./deck";
import {
  CATEGORIES,
  WHEEL_SLICES,
  type CardCategory,
  type DealContext,
  type GameCard,
  type GameSession,
  type Result,
} from "./types";

const fail = (error: string): Result<GameSession> => ({ ok: false, error });

function dealFrom(
  session: GameSession,
  category: CardCategory,
  deck: GameCard[],
  ctx: Omit<DealContext, "heat">,
  rng: () => number,
) {
  const dealCtx = { ...ctx, heat: session.heat };
  return (
    drawCard(
      deck.filter((card) => card.category === category),
      dealCtx,
      session.seen,
      rng,
    ) ?? drawCard(deck, dealCtx, session.seen, rng)
  );
}

function spinGuard(session: GameSession, role: Role): string | null {
  if (session.game !== "wheel") return "This isn't a Wheel of Fortune game.";
  if (session.status !== "active") return "Both people need to join before the first spin.";
  if (session.currentCard) return "Finish or skip the current card first.";
  if (session.choosing) return "Pick a category first.";
  if (session.masterOnlyRoll ? role !== "dom" : role !== session.turn) {
    return session.masterOnlyRoll ? "Only the Master can spin." : "It isn't your turn to spin.";
  }
  return null;
}

/**
 * Spin the wheel. Six slices are the card categories, one is "Spin again" (no card, same turn)
 * and one is "Your choice" (the spinner picks the category).
 */
export function spinWheel(
  session: GameSession,
  role: Role,
  deck: GameCard[],
  ctx: Omit<DealContext, "heat">,
  rng: () => number = Math.random,
): Result<GameSession> {
  const problem = spinGuard(session, role);
  if (problem) return fail(problem);
  const slice = Math.min(WHEEL_SLICES.length - 1, Math.floor(rng() * WHEEL_SLICES.length));
  const landed = WHEEL_SLICES[slice]!;
  const base = { ...session, lastSpin: { slice } };
  if (landed === "again") return { ok: true, value: base };
  if (landed === "choice") return { ok: true, value: { ...base, choosing: true } };
  const draw = dealFrom(session, landed, deck, ctx, rng);
  if (!draw) return fail("No card is available at this heat level.");
  return { ok: true, value: { ...base, currentCard: draw.card, seen: draw.seen } };
}

/** After "Your choice": the spinner names the category and gets a card from it. */
export function pickCategory(
  session: GameSession,
  role: Role,
  category: CardCategory,
  deck: GameCard[],
  ctx: Omit<DealContext, "heat">,
  rng: () => number = Math.random,
): Result<GameSession> {
  if (session.game !== "wheel") return fail("This isn't a Wheel of Fortune game.");
  if (session.status !== "active") return fail("The game isn't running.");
  if (!session.choosing) return fail("There's nothing to pick right now.");
  if (role !== session.turn) return fail("Only the person who spun can choose.");
  if (!CATEGORIES.includes(category)) return fail("Pick one of the categories.");
  const draw = dealFrom(session, category, deck, ctx, rng);
  if (!draw) return fail("No card is available at this heat level.");
  return {
    ok: true,
    value: { ...session, choosing: false, currentCard: draw.card, seen: draw.seen },
  };
}
