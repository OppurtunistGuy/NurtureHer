import type { AppState } from "../types";
import type { GameCard } from "./types";

/** Words too generic to block a card on their own. */
const GENERIC = new Set(["play", "activity", "activities", "with", "and", "the", "any", "nasty"]);

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Break one written limit ("tasting or ingesting semen") into the phrases a card must avoid.
 * Splits on commas, "or", "and" and keeps multi-word phrases whole, so "anal play" blocks
 * "anal play" but a harmless card that only contains "play" is not blocked.
 */
export function limitTerms(limits: string[]): string[] {
  const terms = new Set<string>();
  for (const raw of limits) {
    for (const part of raw.split(/,|;|\bor\b|\band\b/i)) {
      const phrase = normalise(part);
      if (phrase.length < 3 || GENERIC.has(phrase)) continue;
      terms.add(phrase);
      // Also catch the key word on its own ("anal", "semen"), unless it is generic.
      for (const word of phrase.split(" ")) {
        if (word.length >= 4 && !GENERIC.has(word)) terms.add(word);
      }
    }
  }
  return [...terms];
}

/**
 * True when the card is safe to deal. A card is blocked if one of its tags, its title,
 * or its category text contains any term from the couple's hard limits. When in doubt, block.
 */
export function cardRespectsLimits(card: GameCard, hardLimits: string[]): boolean {
  const terms = limitTerms(hardLimits);
  if (terms.length === 0) return true;
  const haystack = normalise([card.title, ...card.limitTags].join(" "));
  const words = new Set(haystack.split(" "));
  return !terms.some((term) => (term.includes(" ") ? haystack.includes(term) : words.has(term)));
}

/** Pull the hard limits out of the saved agreement: the excluded list plus the document line. */
export function hardLimitsFromState(state: Pick<AppState, "agreement">): string[] {
  const out = [...(state.agreement.excluded ?? [])];
  const markdown = state.agreement.document?.markdown ?? "";
  for (const line of markdown.split("\n")) {
    const match = /\*\*hard limits:\*\*\s*(.+)$/i.exec(line.trim());
    if (match?.[1]) out.push(match[1].replace(/\.$/, ""));
  }
  return [...new Set(out.map((item) => item.trim()).filter(Boolean))];
}
