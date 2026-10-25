import type { CardCategory, GameCard, Heat } from "./types";

function box(
  id: string,
  kind: "punishment" | "deduction",
  heat: Heat,
  title: string,
  extra: Partial<GameCard> = {},
  category: CardCategory = "obedience",
): GameCard {
  return { id, title, category, heat, kind, limitTags: [], ...extra };
}

/**
 * What the Surprise Box can hold besides ordinary tasks. Draft for the Master to edit.
 * Nothing physical: the agreement says physical consequences need their own agreement.
 */
export const BOX_DECK: GameCard[] = [
  box("pun-sweet-1", "punishment", "sweet", "Say sorry out loud, in your own words"),
  box("pun-sweet-2", "punishment", "sweet", "Write one line of thanks for them, by hand"),
  box("pun-spicy-1", "punishment", "spicy", "Stay silent unless asked a question", {
    timerMinutes: 5,
  }),
  box("pun-spicy-2", "punishment", "spicy", "Thank them out loud for every instruction", {
    timerMinutes: 10,
  }),
  box("pun-hot-1", "punishment", "hot", "Wait quietly while they decide what happens next", {
    timerMinutes: 3,
  }),
  box("pun-hot-2", "punishment", "hot", "Ask permission before every sentence", {
    timerMinutes: 10,
  }),
  box("ded-sweet", "deduction", "sweet", "Lose 2 game points", { points: 2 }),
  box("ded-spicy", "deduction", "spicy", "Lose 3 game points", { points: 3 }),
  box("ded-hot", "deduction", "hot", "Lose 5 game points", { points: 5 }),
];
