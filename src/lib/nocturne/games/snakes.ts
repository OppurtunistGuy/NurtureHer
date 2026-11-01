import type { Role } from "../types";
import {
  BOARD_SIZE,
  CARD_SQUARES,
  LADDERS,
  LADDER_POINTS,
  SNAKES,
  SNAKE_BITE_POINTS,
  START_POSITIONS,
} from "./board";
import { BOX_DECK } from "./box-deck";
import { drawCard } from "./deck";
import { nextTurn } from "./session";
import type { CardKind, DealContext, GameCard, GameSession, Result } from "./types";

const fail = (error: string): Result<GameSession> => ({ ok: false, error });

/** Fields every Snakes & Ladders session starts with. */
export const SNAKES_START = {
  positions: { ...START_POSITIONS },
  score: { dom: 0, sub: 0 },
  box: { dom: false, sub: false },
  boxPending: false,
};

/** Punishments only exist when BOTH people opted in to the Surprise Box. */
export const boxActive = (s: GameSession) => !!s.box && s.box.dom && s.box.sub;

export function setBoxConsent(session: GameSession, role: Role, consent: boolean): GameSession {
  if (session.game !== "snakes") return session;
  return { ...session, box: { dom: false, sub: false, ...session.box, [role]: consent } };
}

type Ctx = Omit<DealContext, "heat">;

/** Roll the die and move the token. Ladders climb, snakes slide, card squares deal a task. */
export function moveToken(
  session: GameSession,
  role: Role,
  deck: GameCard[],
  ctx: Ctx,
  rng: () => number = Math.random,
): Result<GameSession> {
  if (session.game !== "snakes") return fail("This isn't a Snakes & Ladders game.");
  if (session.status !== "active") return fail("Both people need to join before the first move.");
  if (session.currentCard) return fail("Finish or skip the current card first.");
  if (session.boxPending) return fail("The Surprise Box needs opening first.");
  if (role !== session.turn) return fail("It isn't your turn to roll.");
  const positions = session.positions ?? START_POSITIONS;
  const die = Math.min(6, 1 + Math.floor(rng() * 6));
  const from = positions[role];
  let to = from + die;
  let next: GameSession = { ...session, lastRoll: { die1: die, die2: 1 } };
  if (to >= BOARD_SIZE) {
    next = {
      ...next,
      positions: { ...positions, [role]: BOARD_SIZE },
      lastMove: { role, die, from, to: BOARD_SIZE, event: "finish" },
      winner: role,
    };
    return {
      ok: true,
      value: { ...next, status: "stopped", currentCard: null, stopReason: "finished" },
    };
  }
  let event: "none" | "ladder" | "snake" | "card" = "none";
  let via: number | undefined;
  const score = { dom: 0, sub: 0, ...session.score };
  let boxPending = false;
  if (LADDERS[to]) {
    via = to;
    to = LADDERS[to]!;
    event = "ladder";
    score[role] += LADDER_POINTS;
  } else if (SNAKES[to]) {
    via = to;
    to = SNAKES[to]!;
    event = "snake";
    // The Master's slip rewards the Sub, and may open the Surprise Box for them.
    if (role === "dom") {
      score.sub += SNAKE_BITE_POINTS;
      boxPending = boxActive(session);
    }
  } else if (CARD_SQUARES.includes(to)) {
    const draw = drawCard(deck, { ...ctx, heat: session.heat }, session.seen);
    if (draw) {
      event = "card";
      next = { ...next, currentCard: draw.card, cardFor: role, seen: draw.seen };
    }
  }
  next = {
    ...next,
    positions: { ...positions, [role]: to },
    score,
    boxPending,
    lastMove: { role, die, from, to, event, ...(via ? { via } : {}) },
  };
  if (next.currentCard || boxPending) return { ok: true, value: next };
  return nextTurn(next);
}

function pick(session: GameSession, deck: GameCard[], kind: CardKind, ctx: Ctx, rng: () => number) {
  return drawCard(deck, { ...ctx, heat: session.heat, kinds: [kind] }, session.seen, rng);
}

/**
 * The Sub opens the Surprise Box after the Master's snake bite.
 * About 60% a task, 25% a punishment, 15% a point deduction (game score only, never below zero).
 * If the chosen kind has no card left at this heat, it falls through to the next kind.
 */
export function openBox(
  session: GameSession,
  role: Role,
  tasks: GameCard[],
  ctx: Ctx,
  rng: () => number = Math.random,
): Result<GameSession> {
  if (session.game !== "snakes") return fail("This isn't a Snakes & Ladders game.");
  if (session.status !== "active") return fail("The game isn't running.");
  if (!session.boxPending) return fail("There's no box to open.");
  if (role !== "sub") return fail("Only the Sub opens the box.");
  if (!boxActive(session)) return fail("The Surprise Box wasn't switched on by both of you.");
  const roll = rng();
  const order: CardKind[] =
    roll < 0.6
      ? ["task", "punishment", "deduction"]
      : roll < 0.85
        ? ["punishment", "task", "deduction"]
        : ["deduction", "task", "punishment"];
  let draw = null;
  for (const kind of order) {
    draw = pick(session, kind === "task" ? tasks : BOX_DECK, kind, ctx, rng);
    if (draw) break;
  }
  const score = { dom: 0, sub: 0, ...session.score };
  if (!draw) {
    return nextTurn({
      ...session,
      boxPending: false,
      lastBox: { kind: "empty", title: "The box was empty." },
    });
  }
  const card = draw.card;
  const seen = draw.seen;
  const lastBox = {
    kind: card.kind,
    title: card.title,
    ...(card.points ? { points: card.points } : {}),
  };
  if (card.kind === "deduction") {
    score.sub = Math.max(0, score.sub - (card.points ?? 0));
    return nextTurn({ ...session, score, seen, boxPending: false, lastBox });
  }
  return {
    ok: true,
    value: { ...session, seen, boxPending: false, currentCard: card, cardFor: "sub", lastBox },
  };
}

/** A reward card adds its points to the person it was dealt to. Game score only. */
export function awardCardPoints(session: GameSession): GameSession {
  const card = session.currentCard;
  if (session.game !== "snakes" || !card || card.kind !== "reward" || !card.points) return session;
  const who = session.cardFor ?? session.turn;
  if (!who) return session;
  const score = { dom: 0, sub: 0, ...session.score };
  score[who] += card.points;
  return { ...session, score };
}
