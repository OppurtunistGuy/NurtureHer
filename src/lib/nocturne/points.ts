import { z } from "zod";
import type { AppState } from "./types";

export const DEFAULT_LEVELS = [
  { threshold: 0, label: "New beginnings", milestone: "Agree on a steady, realistic start." },
  {
    threshold: 50,
    label: "Finding rhythm",
    milestone: "First 50 reward points: celebrate the effort.",
  },
  {
    threshold: 150,
    label: "Steady progress",
    milestone: "150 points: choose a shared celebration together.",
  },
  {
    threshold: 300,
    label: "Reliable commitment",
    milestone: "300 points: reflect on what has improved.",
  },
  {
    threshold: 600,
    label: "Milestone maker",
    milestone: "600 points: set the next goal together.",
  },
];
export const pointsAwardSchema = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum(["reward", "punishment"]),
    amount: z.number().int().min(1).max(100),
    reason: z.string().trim().min(1).max(500),
    submissionId: z.string().min(1).max(100).optional(),
  })
  .strict();
export const pointLevelSchema = z
  .object({
    threshold: z.number().int().min(0).max(1000000),
    label: z.string().trim().min(1).max(50),
    milestone: z.string().trim().min(1).max(200),
  })
  .strict();
export const pointsLevelsSchema = z
  .array(pointLevelSchema)
  .min(1)
  .max(10)
  .refine(
    (levels) =>
      levels[0]?.threshold === 0 &&
      levels.every((level, index) => index === 0 || level.threshold > levels[index - 1]!.threshold),
    "Start at zero and use strictly increasing thresholds.",
  );
export const pointsEntrySchema = pointsAwardSchema.extend({
  at: z.string(),
  by: z.literal("dom"),
  resolvedAt: z.string().optional(),
  resolution: z.string().max(500).optional(),
  voidedAt: z.string().optional(),
  voidReason: z.string().max(500).optional(),
});
export const pointsStateSchema = z.object({
  ledger: z.array(pointsEntrySchema),
  levels: pointsLevelsSchema,
});
export type PointsAward = z.infer<typeof pointsAwardSchema>;
export type PointsState = z.infer<typeof pointsStateSchema>;
export type PointsLevel = z.infer<typeof pointLevelSchema>;

export function pointsSummary(state: AppState) {
  const points = state.points ?? { ledger: [], levels: DEFAULT_LEVELS };
  const active = points.ledger.filter((entry) => !entry.voidedAt);
  const rewards = active
    .filter((entry) => entry.kind === "reward")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const punishment = active.filter((entry) => entry.kind === "punishment");
  const outstanding = punishment
    .filter((entry) => !entry.resolvedAt)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const level = [...points.levels].reverse().find((item) => rewards >= item.threshold)!;
  const next = points.levels.find((item) => item.threshold > rewards);
  const progress = next
    ? Math.min(
        100,
        Math.round(((rewards - level.threshold) / (next.threshold - level.threshold)) * 100),
      )
    : 100;
  return {
    ...points,
    rewards,
    outstanding,
    totalPunishment: punishment.reduce((sum, entry) => sum + entry.amount, 0),
    level,
    next,
    progress,
  };
}
