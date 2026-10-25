import type { Heat } from "@/lib/nocturne/games/types";
import type { Role } from "@/lib/nocturne/types";

/** One colour per person, used for tokens, scores and the turn bar. */
export const ROLE_COLOR: Record<Role, string> = { dom: "#c9a45c", sub: "#e0566e" };

export const HEAT: Record<Heat, { label: string; blurb: string; text: string; solid: string }> = {
  sweet: {
    label: "Sweet",
    blurb: "Light and affectionate.",
    text: "text-[#a9c9a9] border-[#8fb08f]/60",
    solid: "bg-[#8fb08f] text-[#0f1a10] border-[#8fb08f]",
  },
  spicy: {
    label: "Spicy",
    blurb: "Flirty, with a little more control.",
    text: "text-[#e09a55] border-[#d4843a]/60",
    solid: "bg-[#d4843a] text-[#1c0f05] border-[#d4843a]",
  },
  hot: {
    label: "Hot",
    blurb: "The most intense cards, still inside your limits.",
    text: "text-[#ef6a7c] border-[#e0485c]/60",
    solid: "bg-[#c2324a] text-[#fff1f1] border-[#c2324a]",
  },
};
