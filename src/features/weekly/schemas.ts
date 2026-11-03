import { z } from "zod";
import { isIsoDate } from "@/lib/domain/dates";
import { MEASURE_UNITS } from "@/lib/domain/goals";
import { FOCUS_AREAS } from "@/lib/domain/weekly";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const weekStartSchema = isoDate;

export const weekPlanSchema = z
  .object({
    focus: optionalText(500),
    capacityHours: z.number().min(0).max(120).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type WeekPlanInput = z.infer<typeof weekPlanSchema>;

export const weeklyGoalCreateSchema = z.object({
  focusArea: z.enum(FOCUS_AREAS),
  parentId: z.uuid("Link the goal to a monthly, quarterly or annual objective."),
  pillarId: z.uuid().nullish().transform((v) => v ?? null),
  title: z.string().trim().min(1, "Give the weekly goal a title.").max(200),
  successMetric: z.string().trim().min(1, "How will you measure it?").max(200),
  unit: z.enum(MEASURE_UNITS).default("count"),
  measurementMode: z.enum(["latest", "cumulative"]).default("cumulative"),
  baselineValue: z.number().refine(Number.isFinite).default(0),
  targetValue: z.number().refine(Number.isFinite, "Set a target."),
  priority: z.number().int().min(1).max(4).default(3),
  estimatedHours: z.number().min(0).max(200).nullish().transform((v) => v ?? null),
});
export type WeeklyGoalCreateInput = z.infer<typeof weeklyGoalCreateSchema>;

export const carryForwardSchema = z.object({
  toWeek: isoDate.optional(),
  goalId: z.uuid().nullish(),
});

export const rescheduleSchema = z.object({ dueOn: isoDate });

export const weekReviewSchema = z.object({
  wins: optionalText(5000),
  lessons: optionalText(5000),
  notes: optionalText(5000),
});
export type WeekReviewInput = z.infer<typeof weekReviewSchema>;
