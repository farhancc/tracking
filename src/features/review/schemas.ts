import { z } from "zod";
import { MISS_REASONS } from "@/lib/domain/review";

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const answersSchema = z.object({
  missed: z
    .array(z.object({ goalId: z.uuid(), reason: z.enum(MISS_REASONS), note: optionalText(1000) }))
    .max(100)
    .default([]),
  completedNotes: optionalText(5000),
  biggestAchievement: optionalText(5000),
  learned: optionalText(5000),
  revenue: optionalText(5000),
  interest: optionalText(5000),
  wastedTime: optionalText(5000),
  stopDoing: optionalText(2000),
  continueDoing: optionalText(2000),
  changeNextWeek: optionalText(2000),
});
