import { z } from "zod";

const role = z.enum(["dom", "sub"]);
export const heatSchema = z.enum(["sweet", "spicy", "hot"]);
const card = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  category: z.enum(["service", "obedience", "affection", "teasing", "rewards", "confessions"]),
  heat: heatSchema,
  kind: z.enum(["task", "reward", "punishment", "deduction"]),
  timerMinutes: z.number().int().min(1).max(600).optional(),
  points: z.number().int().min(0).max(100).optional(),
  limitTags: z.array(z.string().max(60)).max(20),
});
const session = z.object({
  id: z.string().min(1).max(100),
  game: z.enum(["dice", "wheel", "snakes"]),
  masterOnlyRoll: z.boolean().default(false),
  lastRoll: z
    .object({ die1: z.number().int().min(1).max(6), die2: z.number().int().min(1).max(6) })
    .optional(),
  lastSpin: z.object({ slice: z.number().int().min(0).max(7) }).optional(),
  choosing: z.boolean().optional(),
  heat: heatSchema,
  status: z.enum(["lobby", "active", "stopped"]),
  joined: z.object({ dom: z.boolean(), sub: z.boolean() }),
  turn: role.nullable(),
  skips: z.object({ dom: z.number().int().min(0).max(10), sub: z.number().int().min(0).max(10) }),
  currentCard: card.nullable(),
  seen: z.array(z.string().max(100)).max(500),
  stoppedBy: role.optional(),
  stopReason: z.enum(["stop", "red"]).optional(),
});
export const gamesStateSchema = z.object({
  session: session.nullable(),
  hidden: z.array(z.string().max(100)).max(500),
  notForMe: z.array(z.string().max(100)).max(500),
});

/** Game commands as the server accepts them. Nothing else gets through. */
export const gameCommandSchemas = [
  z
    .object({
      type: z.literal("game.start"),
      game: z.enum(["dice", "wheel"]),
      heat: heatSchema,
      masterOnlyRoll: z.boolean(),
    })
    .strict(),
  ...(["join", "roll", "spin", "done", "skip", "yellow", "stop", "red"] as const).map((name) =>
    z.object({ type: z.literal(`game.${name}`) }).strict(),
  ),
  z
    .object({
      type: z.literal("game.pick"),
      category: z.enum(["service", "obedience", "affection", "teasing", "rewards", "confessions"]),
    })
    .strict(),
  z.object({ type: z.literal("game.hide"), cardId: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("game.refuse"), cardId: z.string().min(1).max(100) }).strict(),
] as const;
