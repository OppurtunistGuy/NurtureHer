import type { Role } from "../types";
import { drawCard } from "./deck";
import {
  CATEGORIES,
  type DealContext,
  type GameCard,
  type GameSession,
  type Result,
} from "./types";

/** A die from 1 to 6. */
function die(rng: () => number): number {
  return Math.min(6, 1 + Math.floor(rng() * 6));
}

/**
 * Roll two dice. Die 1 picks the category and die 2 sets the minutes on a task card.
 * Falls back to any dealable card if the picked category has nothing at this heat level.
 * Only the person whose turn it is may roll, and if the Master locked the dice, only the Master.
 */
export function rollDice(
  session: GameSession,
  role: Role,
  deck: GameCard[],
  ctx: Omit<DealContext, "heat">,
  rng: () => number = Math.random,
): Result<GameSession> {
  if (session.game !== "dice") return { ok: false, error: "This isn't a Dice Roll game." };
  if (session.status !== "active") {
    return { ok: false, error: "Both people need to join before the first roll." };
  }
  if (session.currentCard) return { ok: false, error: "Finish or skip the current card first." };
  if (session.masterOnlyRoll ? role !== "dom" : role !== session.turn) {
    return {
      ok: false,
      error: session.masterOnlyRoll ? "Only the Master can roll." : "It isn't your turn to roll.",
    };
  }
  const die1 = die(rng);
  const die2 = die(rng);
  const dealCtx = { ...ctx, heat: session.heat };
  const category = CATEGORIES[die1 - 1]!;
  const draw =
    drawCard(
      deck.filter((card) => card.category === category),
      dealCtx,
      session.seen,
      rng,
    ) ?? drawCard(deck, dealCtx, session.seen, rng);
  if (!draw) return { ok: false, error: "No card is available at this heat level." };
  // Die 2 sets the minutes, unless the card already says how long in its own words
  // ("... for 10 minutes"), so the title and the timer never disagree.
  const sayMinutes = /\bminutes?\b/i.test(draw.card.title);
  const card =
    draw.card.kind === "task" && !sayMinutes ? { ...draw.card, timerMinutes: die2 } : draw.card;
  return {
    ok: true,
    value: { ...session, lastRoll: { die1, die2 }, currentCard: card, seen: draw.seen },
  };
}
