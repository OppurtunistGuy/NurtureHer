import type { AppState, Role } from "../types";
import { dealable } from "./deck";
import {
  HAND_SIZES,
  HEAT_ORDER,
  NIGHT_LENGTHS,
  PACE_ORDER,
  type DealContext,
  type GameCard,
  type GameSession,
  type GamesState,
  type ListAnswer,
  type Night,
  type Pace,
  type PlayedCard,
  type Result,
} from "./types";

/**
 * Hand of Cards: the Master holds a hand and chooses which card the Sub gets.
 * The Sub holds Mercy (her free skips) and Counter (swap for another card in his hand).
 * Between rounds both check in; the gentlest answer wins. The last card is always aftercare.
 */

const fail = (error: string): Result<GameSession> => ({ ok: false, error });
type Ctx = Omit<DealContext, "heat">;
type Lists = NonNullable<GamesState["lists"]>;

export const MIN_MATCHED = 8;

export function newNight(length: number, handSize: number): Night {
  return {
    length,
    round: 1,
    handSize,
    hand: [],
    counter: 1,
    phase: "choose",
    checkin: { dom: null, sub: null },
    played: [],
  };
}

export const validNight = (length: number, handSize: number) =>
  (NIGHT_LENGTHS as readonly number[]).includes(length) &&
  (HAND_SIZES as readonly number[]).includes(handSize);

/** Cards both people said yes or maybe to. An unanswered card counts as not agreed. */
export function matchedIds(lists: Lists | undefined): Set<string> {
  const out = new Set<string>();
  if (!lists) return out;
  for (const [id, answer] of Object.entries(lists.dom)) {
    const other = lists.sub[id];
    if (answer !== "no" && other && other !== "no") out.add(id);
  }
  return out;
}

/** Every card the couple could be dealt tonight at or below this heat. */
export function nightPool(deck: GameCard[], lists: Lists | undefined, ctx: DealContext) {
  const matched = matchedIds(lists);
  return dealable(
    deck.filter((card) => matched.has(card.id)),
    ctx,
  );
}

/** Top the hand up to its size: cards at tonight's heat first, then gentler ones. No repeats. */
function fillHand(
  session: GameSession,
  night: Night,
  deck: GameCard[],
  lists: Lists | undefined,
  ctx: Ctx,
  rng: () => number,
): { night: Night; seen: string[] } {
  const pool = nightPool(deck, lists, { ...ctx, heat: session.heat });
  const taken = new Set([...session.seen, ...night.hand.map((card) => card.id)]);
  const level = HEAT_ORDER.indexOf(session.heat);
  const hand = night.hand.filter((card) => HEAT_ORDER.indexOf(card.heat) <= level);
  const seen = [...session.seen];
  for (let step = level; step >= 0 && hand.length < night.handSize; step--) {
    const heat = HEAT_ORDER[step];
    const options = pool.filter((card) => card.heat === heat && !taken.has(card.id));
    while (options.length && hand.length < night.handSize) {
      const index = Math.min(options.length - 1, Math.floor(rng() * options.length));
      const [card] = options.splice(index, 1);
      hand.push(card!);
      taken.add(card!.id);
      seen.push(card!.id);
    }
  }
  return { night: { ...night, hand }, seen };
}

function aftercare(
  session: GameSession,
  night: Night,
  aftercareDeck: GameCard[],
  rng: () => number,
): GameSession {
  const index = Math.min(aftercareDeck.length - 1, Math.floor(rng() * aftercareDeck.length));
  return {
    ...session,
    turn: null,
    cardFor: undefined,
    currentCard: aftercareDeck[index] ?? null,
    night: { ...night, phase: "aftercare", hand: [], checkin: { dom: null, sub: null } },
  };
}

/** Both have joined: deal the Master's first hand. */
export function startNight(
  session: GameSession,
  deck: GameCard[],
  lists: Lists | undefined,
  ctx: Ctx,
  rng: () => number,
): GameSession {
  if (session.game !== "hand" || session.status !== "active" || !session.night) return session;
  const filled = fillHand(session, session.night, deck, lists, ctx, rng);
  return {
    ...session,
    turn: "dom",
    seen: filled.seen,
    night: { ...filled.night, phase: "choose" },
  };
}

function guard(session: GameSession, phase: Night["phase"]): string | null {
  if (session.game !== "hand" || !session.night) return "This isn't a Hand of Cards game.";
  if (session.status !== "active") return "The night hasn't started yet.";
  if (session.night.phase !== phase)
    return phase === "choose"
      ? "There's already a card in play."
      : phase === "play"
        ? "There's no card in play."
        : "There's no check-in right now.";
  return null;
}

/** The Master plays one card from his hand to the Sub. */
export function playCard(session: GameSession, role: Role, cardId: string): Result<GameSession> {
  const problem = guard(session, "choose");
  if (problem) return fail(problem);
  if (role !== "dom") return fail("Only the Master plays cards.");
  const night = session.night!;
  const card = night.hand.find((c) => c.id === cardId);
  if (!card) return fail("That card isn't in your hand.");
  return {
    ok: true,
    value: {
      ...session,
      turn: "sub",
      cardFor: "sub",
      currentCard: card,
      night: { ...night, phase: "play", hand: night.hand.filter((c) => c.id !== cardId) },
    },
  };
}

/** The Sub swaps the card in play for another card from his hand, at random. Once a night. */
export function counterCard(
  session: GameSession,
  role: Role,
  rng: () => number = Math.random,
): Result<GameSession> {
  const problem = guard(session, "play");
  if (problem) return fail(problem);
  if (role !== "sub") return fail("Only the Sub holds the Counter card.");
  const night = session.night!;
  if (night.counter <= 0) return fail("Your Counter card is used up for tonight.");
  if (!night.hand.length) return fail("There's no other card in the Master's hand.");
  const index = Math.min(night.hand.length - 1, Math.floor(rng() * night.hand.length));
  const next = night.hand[index]!;
  const old = session.currentCard!;
  return {
    ok: true,
    value: {
      ...session,
      currentCard: next,
      night: {
        ...night,
        counter: night.counter - 1,
        hand: night.hand.filter((_, i) => i !== index),
        played: [...night.played, { title: old.title, heat: old.heat, outcome: "countered" }],
      },
    },
  };
}

/**
 * The card in play is finished: done, Mercy (a free skip) or YELLOW.
 * Then comes the check-in, or aftercare after the last round.
 */
export function finishCard(
  session: GameSession,
  outcome: PlayedCard["outcome"],
  aftercareDeck: GameCard[],
  rng: () => number = Math.random,
): Result<GameSession> {
  const problem = guard(session, "play");
  if (problem) return fail(problem);
  const night = session.night!;
  const card = session.currentCard!;
  const played = [...night.played, { title: card.title, heat: card.heat, outcome }];
  const after = { ...night, played };
  if (night.round >= night.length)
    return { ok: true, value: aftercare(session, after, aftercareDeck, rng) };
  return {
    ok: true,
    value: {
      ...session,
      turn: null,
      cardFor: undefined,
      currentCard: null,
      night: { ...after, phase: "checkin", checkin: { dom: null, sub: null } },
    },
  };
}

/** Each person answers the check-in. Once both have, the gentlest answer sets the next round. */
export function answerCheckin(
  session: GameSession,
  role: Role,
  pace: Pace,
  deck: GameCard[],
  lists: Lists | undefined,
  ctx: Ctx,
  aftercareDeck: GameCard[],
  rng: () => number = Math.random,
): Result<GameSession> {
  const problem = guard(session, "checkin");
  if (problem) return fail(problem);
  if (!PACE_ORDER.includes(pace)) return fail("Choose how you'd like to go on.");
  const night = session.night!;
  const checkin = { ...night.checkin, [role]: pace };
  if (!checkin.dom || !checkin.sub)
    return { ok: true, value: { ...session, night: { ...night, checkin } } };
  const gentlest =
    PACE_ORDER[Math.min(PACE_ORDER.indexOf(checkin.dom), PACE_ORDER.indexOf(checkin.sub))]!;
  if (gentlest === "end") return { ok: true, value: aftercare(session, night, aftercareDeck, rng) };
  const level = HEAT_ORDER.indexOf(session.heat);
  const heat =
    gentlest === "up"
      ? HEAT_ORDER[Math.min(HEAT_ORDER.length - 1, level + 1)]!
      : gentlest === "down"
        ? HEAT_ORDER[Math.max(0, level - 1)]!
        : session.heat;
  const moved: GameSession = { ...session, heat };
  const filled = fillHand(moved, { ...night, round: night.round + 1 }, deck, lists, ctx, rng);
  if (!filled.night.hand.length)
    return { ok: true, value: aftercare(moved, filled.night, aftercareDeck, rng) };
  return {
    ok: true,
    value: {
      ...moved,
      turn: "dom",
      seen: filled.seen,
      night: { ...filled.night, phase: "choose", checkin: { dom: null, sub: null } },
    },
  };
}

/** Aftercare done: the night ends. The recap stays until the next game starts. */
export function endNight(session: GameSession): Result<GameSession> {
  const problem = guard(session, "aftercare");
  if (problem) return fail(problem);
  return {
    ok: true,
    value: { ...session, status: "stopped", stopReason: "finished", currentCard: null },
  };
}

/** Record answers on someone's private list. Unknown card ids are refused. */
export function saveList(
  games: GamesState,
  role: Role,
  answers: Record<string, ListAnswer>,
  knownIds: Set<string>,
): GamesState {
  for (const id of Object.keys(answers))
    if (!knownIds.has(id)) throw new Error("That card isn't in the deck.");
  const lists = games.lists ?? { dom: {}, sub: {} };
  return { ...games, lists: { ...lists, [role]: { ...lists[role], ...answers } } };
}

/**
 * What one person may see. Your partner's list and the Master's hand stay private,
 * and a check-in answer stays hidden until both have answered.
 */
export function gamesForViewer(state: AppState, role: Role): AppState {
  const games = state.games;
  if (!games) return state;
  const other: Role = role === "dom" ? "sub" : "dom";
  const lists = games.lists;
  let session = games.session;
  if (session?.night) {
    const n = session.night;
    session = {
      ...session,
      night: {
        ...n,
        handCount: n.hand.length,
        hand: role === "dom" ? n.hand : [],
        answered: { dom: !!n.checkin.dom, sub: !!n.checkin.sub },
        checkin: { ...n.checkin, [other]: null },
      },
    };
  }
  return {
    ...state,
    games: {
      ...games,
      session,
      ...(lists
        ? {
            lists: { ...lists, [other]: {} },
            matchedCount: matchedIds(lists).size,
            listCounts: {
              dom: Object.keys(lists.dom).length,
              sub: Object.keys(lists.sub).length,
            },
          }
        : {}),
    },
  };
}
