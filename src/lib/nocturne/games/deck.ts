import { cardRespectsLimits } from "./limits";
import { HEAT_ORDER, type CardKind, type DealContext, type GameCard, type Heat } from "./types";

/** Normal deals only hand out tasks and rewards. Punishments and deductions come from the Surprise Box. */
const DEFAULT_KINDS: CardKind[] = ["task", "reward"];

export function heatAtOrBelow(cardHeat: Heat, chosen: Heat): boolean {
  return HEAT_ORDER.indexOf(cardHeat) <= HEAT_ORDER.indexOf(chosen);
}

/** Every card that may be dealt right now: right heat, no limit crossed, not hidden, not refused. */
export function dealable(deck: GameCard[], ctx: DealContext): GameCard[] {
  const kinds = ctx.kinds ?? DEFAULT_KINDS;
  return deck.filter(
    (card) =>
      kinds.includes(card.kind) &&
      heatAtOrBelow(card.heat, ctx.heat) &&
      !ctx.hidden.includes(card.id) &&
      !ctx.notForMe.includes(card.id) &&
      cardRespectsLimits(card, ctx.hardLimits),
  );
}

export interface Draw {
  card: GameCard;
  /** Updated list of dealt ids. Resets once every dealable card has been shown. */
  seen: string[];
}

/** Pick a card at random without repeating until the whole pool has been used. */
export function drawCard(
  deck: GameCard[],
  ctx: DealContext,
  seen: string[],
  rng: () => number = Math.random,
): Draw | null {
  const pool = dealable(deck, ctx);
  if (pool.length === 0) return null;
  let fresh = pool.filter((card) => !seen.includes(card.id));
  let nextSeen = seen;
  if (fresh.length === 0) {
    fresh = pool;
    nextSeen = [];
  }
  const index = Math.min(fresh.length - 1, Math.floor(rng() * fresh.length));
  const card = fresh[index]!;
  return { card, seen: [...nextSeen, card.id] };
}

/** A card the Master writes must not cross a hard limit either. */
export function validateNewCard(card: GameCard, hardLimits: string[]): string | null {
  if (!card.title.trim()) return "Give the card a title.";
  if (card.title.length > 200) return "Keep the title under 200 characters.";
  if (!cardRespectsLimits(card, hardLimits)) {
    return "This card touches one of your hard limits, so it can't be added.";
  }
  return null;
}
