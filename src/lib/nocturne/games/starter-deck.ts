import type { CardCategory, GameCard, Heat } from "./types";

function card(
  id: string,
  category: CardCategory,
  heat: Heat,
  title: string,
  extra: Partial<GameCard> = {},
): GameCard {
  return {
    id,
    title,
    category,
    heat,
    kind: category === "rewards" ? "reward" : "task",
    limitTags: [],
    ...extra,
  };
}

/**
 * The starter set from the Games plan: one card per category and heat level.
 * It is a draft for the Master to edit. Nothing here touches the couple's hard limits.
 */
export const STARTER_DECK: GameCard[] = [
  card("svc-sweet", "service", "sweet", "Make their favourite drink"),
  card("svc-spicy", "service", "spicy", "Prepare their clothes for tomorrow"),
  card("svc-hot", "service", "hot", "A full evening of serving on request", { timerMinutes: 60 }),
  card("obd-sweet", "obedience", "sweet", 'Use "Sir" or "Ma\'am" for 10 minutes', {
    timerMinutes: 10,
  }),
  card("obd-spicy", "obedience", "spicy", "Ask permission before speaking for 15 minutes", {
    timerMinutes: 15,
  }),
  card("obd-hot", "obedience", "hot", "Follow three orders without questions"),
  card("aff-sweet", "affection", "sweet", "A 2-minute hug", { timerMinutes: 2 }),
  card("aff-spicy", "affection", "spicy", "A slow massage, their choice of spot", {
    timerMinutes: 4,
    limitTags: ["massage"],
  }),
  card("aff-hot", "affection", "hot", "Their choice of where you kiss them", {
    limitTags: ["kissing"],
  }),
  card("tea-sweet", "teasing", "sweet", "A compliment in a whisper"),
  card("tea-spicy", "teasing", "spicy", "Describe what you want, without touching"),
  card("tea-hot", "teasing", "hot", "A tease that must stop when the timer ends", {
    timerMinutes: 5,
  }),
  card("rew-sweet", "rewards", "sweet", "Pick the movie tonight", { points: 2 }),
  card("rew-spicy", "rewards", "spicy", "Skip one chore this week", { points: 5 }),
  card("rew-hot", "rewards", "hot", "A reward of their choosing", { points: 10 }),
  card("con-sweet", "confessions", "sweet", "Share a secret wish"),
  card("con-spicy", "confessions", "spicy", "A fantasy you haven't said aloud"),
  card("con-hot", "confessions", "hot", "Something you want to try next"),
];
