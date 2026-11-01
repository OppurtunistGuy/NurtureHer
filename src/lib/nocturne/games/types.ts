import type { Role } from "../types";

/** Sweet < Spicy < Hot. A game dealt at one level only shows cards at or below it. */
export type Heat = "sweet" | "spicy" | "hot";
export const HEAT_ORDER: Heat[] = ["sweet", "spicy", "hot"];

export type CardCategory =
  "service" | "obedience" | "affection" | "teasing" | "rewards" | "confessions";

/** Order matters: the Dice Roll maps die 1 (1..6) to this list. */
export const CATEGORIES: CardCategory[] = [
  "service",
  "obedience",
  "affection",
  "teasing",
  "rewards",
  "confessions",
];

export const CATEGORY_LABEL: Record<CardCategory, string> = {
  service: "Service",
  obedience: "Obedience",
  affection: "Affection",
  teasing: "Teasing",
  rewards: "Rewards",
  confessions: "Confessions",
};

/** What a card asks of the Sub. Only the Surprise Box (a later phase) may deal punishments. */
export type CardKind = "task" | "reward" | "punishment" | "deduction";

export interface GameCard {
  id: string;
  title: string;
  category: CardCategory;
  heat: Heat;
  kind: CardKind;
  /** Optional countdown in minutes. */
  timerMinutes?: number | undefined;
  /** Optional game points (a reward adds, a deduction removes). Game score only. */
  points?: number | undefined;
  /** Words describing what the card touches, e.g. "kissing". Matched against the hard limits. */
  limitTags: string[];
}

/** Wheel of Fortune slices in order, clockwise from the top: six categories plus two specials. */
export const WHEEL_SLICES: (CardCategory | "again" | "choice")[] = [
  "service",
  "obedience",
  "affection",
  "again",
  "teasing",
  "rewards",
  "choice",
  "confessions",
];

export type GameId = "dice" | "wheel" | "snakes" | "hand";

export type SessionStatus = "lobby" | "active" | "stopped";

/** The last Dice Roll: die 1 picks the category, die 2 sets the minutes (1 to 6). */
export interface DiceRoll {
  die1: number;
  die2: number;
}

export interface GameSession {
  id: string;
  game: GameId;
  /** Dice Roll only: when true, only the Master may roll. */
  masterOnlyRoll: boolean;
  lastRoll?: DiceRoll | undefined;
  /** Wheel of Fortune only: the slice the wheel last landed on. */
  lastSpin?: { slice: number } | undefined;
  /** Wheel of Fortune only: landed on "Your choice", waiting for a category. */
  choosing?: boolean | undefined;
  heat: Heat;
  status: SessionStatus;
  /** Both people must join before the first move. */
  joined: Record<Role, boolean>;
  /** Whose turn it is once active. */
  turn: Role | null;
  /** Free skips left per person. A skip never costs points. */
  skips: Record<Role, number>;
  currentCard: GameCard | null;
  /** Card ids already dealt this game, so the deck does not repeat until it runs out. */
  seen: string[];
  stoppedBy?: Role;
  stopReason?: "stop" | "red" | "finished";
  /** Snakes & Ladders only. */
  positions?: Record<Role, number> | undefined;
  /** Game points, kept apart from the real reward points. Deductions only ever touch this. */
  score?: Record<Role, number> | undefined;
  /** Who agreed to the Surprise Box. It only works when both did. */
  box?: Record<Role, boolean> | undefined;
  /** The Master was bitten: the Sub may open the Surprise Box. */
  boxPending?: boolean | undefined;
  /** Who the current card is for, when that isn't whoever's turn it is (a Surprise Box card). */
  cardFor?: Role | undefined;
  lastMove?:
    | {
        role: Role;
        die: number;
        from: number;
        to: number;
        event: "none" | "ladder" | "snake" | "card" | "finish";
        via?: number;
      }
    | undefined;
  lastBox?: { kind: CardKind | "empty"; title: string; points?: number } | undefined;
  winner?: Role | undefined;
  /** Hand of Cards only. */
  night?: Night | undefined;
}

/** How each person answers the check-in between Hand of Cards rounds. Gentlest wins. */
export type Pace = "end" | "down" | "stay" | "up";
export const PACE_ORDER: Pace[] = ["end", "down", "stay", "up"];
export type ListAnswer = "yes" | "maybe" | "no";
export const NIGHT_LENGTHS = [3, 5, 7, 10] as const;
export const HAND_SIZES = [3, 5] as const;

export interface PlayedCard {
  title: string;
  heat: Heat;
  outcome: "done" | "mercy" | "countered" | "yellow";
}

export interface Night {
  /** How many cards tonight, before aftercare. */
  length: number;
  /** 1-based round being played. */
  round: number;
  handSize: number;
  /** The Master's hand. Never sent to the Sub: the server swaps it for handCount. */
  hand: GameCard[];
  handCount?: number | undefined;
  /** The Sub's Counter cards left. Her Mercy cards are her free skips. */
  counter: number;
  phase: "choose" | "play" | "checkin" | "aftercare";
  checkin: { dom: Pace | null; sub: Pace | null };
  /** Who has answered the check-in. Filled in for the viewer; the answers stay hidden. */
  answered?: { dom: boolean; sub: boolean } | undefined;
  played: PlayedCard[];
}

export interface DealContext {
  heat: Heat;
  /** The couple's hard limits as written, e.g. from the agreement. */
  hardLimits: string[];
  /** Cards the Master hid. */
  hidden: string[];
  /** Cards the Sub marked "not for me". */
  notForMe: string[];
  /** Also keep reward / punishment / deduction kinds out of normal deals. */
  kinds?: CardKind[] | undefined;
}

export const FREE_SKIPS_PER_PERSON = 2;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Saved with the space. Optional on AppState so existing spaces are untouched. */
export interface GamesState {
  session: GameSession | null;
  /** Cards the Master hid. */
  hidden: string[];
  /** Cards the Sub marked "not for me". */
  notForMe: string[];
  /** Each person's private yes / maybe / no list for Hand of Cards. Only your own is sent to you. */
  lists?: { dom: Record<string, ListAnswer>; sub: Record<string, ListAnswer> } | undefined;
  /** Filled in for the viewer: how many cards you both said yes or maybe to, and list progress. */
  matchedCount?: number | undefined;
  listCounts?: { dom: number; sub: number } | undefined;
}

export const EMPTY_GAMES: GamesState = { session: null, hidden: [], notForMe: [] };
