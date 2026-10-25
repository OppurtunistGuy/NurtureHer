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

export type GameId = "dice" | "wheel" | "snakes";

export type SessionStatus = "lobby" | "active" | "stopped";

export interface GameSession {
  id: string;
  game: GameId;
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
  stopReason?: "stop" | "red";
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
