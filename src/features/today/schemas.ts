import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30.");

export const quickTaskSchema = z.object({
  title: z.string().trim().min(1, "What do you need to do?").max(300),
  estimatedMinutes: z.number().int().min(0).max(1440).nullish().transform((v) => v ?? null),
  scheduledStart: clock.nullish().transform((v) => v ?? null),
  goalId: z.uuid().nullish().transform((v) => v ?? null),
  mitRank: z.number().int().min(1).max(3).nullish().transform((v) => v ?? null),
  isDeliverable: z.boolean().default(false),
});
export type QuickTaskInput = z.infer<typeof quickTaskSchema>;

export const setMitSchema = z.object({
  rank: z.number().int().min(1).max(3),
  taskId: z.uuid().nullable(),
});

export const dayPlanSchema = z.object({
  availableMinutes: z.number().int().min(0).max(1440).nullable(),
});

export const reflectionSchema = z.object({
  accomplished: optionalText(5000),
  learned: optionalText(5000),
  wentWrong: optionalText(5000),
  improveTomorrow: optionalText(5000),
});
export type ReflectionInput = z.infer<typeof reflectionSchema>;

export const habitCreateSchema = z.object({
  name: z.string().trim().min(1, "Name the habit.").max(120),
  scheduleDays: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Pick at least one day.")
    .max(7)
    .transform((d) => Array.from(new Set(d)).sort()),
  pillarId: z.uuid().nullish().transform((v) => v ?? null),
  description: optionalText(1000),
});
export type HabitCreateInput = z.infer<typeof habitCreateSchema>;

export const checkinSchema = z.object({
  status: z.enum(["done", "skipped"]).nullable(), // null clears the check-in
  note: optionalText(500),
});
