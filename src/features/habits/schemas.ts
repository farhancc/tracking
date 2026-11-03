import { z } from "zod";
import { isIsoDate } from "@/lib/domain/dates";
import { CHECKIN_STATUSES, SCHEDULE_KINDS } from "@/lib/domain/habits";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const dayList = z
  .array(z.coerce.number().int().min(0).max(6))
  .min(1, "Pick at least one day.")
  .max(7)
  .transform((d) => Array.from(new Set(d)).sort());

const habitFields = {
  name: z.string().trim().min(1, "Name the habit.").max(120),
  description: optionalText(1000),
  scheduleKind: z.enum(SCHEDULE_KINDS),
  scheduleDays: dayList,
  weeklyTarget: z.coerce.number().int().min(1).max(7).nullish().transform((v) => v ?? null),
  startedOn: isoDate,
  pillarId: z.uuid().nullish().transform((v) => v ?? null),
  sortOrder: z.coerce.number().int().min(0).max(1000),
};

const scheduleCheck = (v: { scheduleKind?: string; weeklyTarget?: number | null }, ctx: z.RefinementCtx) => {
  if (v.scheduleKind === "weekly" && !v.weeklyTarget) ctx.addIssue({ code: "custom", path: ["weeklyTarget"], message: "How many times a week?" });
};

export const habitCreateSchema = z
  .object({
    ...habitFields,
    scheduleKind: habitFields.scheduleKind.default("days"),
    scheduleDays: habitFields.scheduleDays.default([0, 1, 2, 3, 4, 5, 6]),
    startedOn: isoDate.optional(),
    sortOrder: habitFields.sortOrder.default(0),
  })
  .superRefine(scheduleCheck)
  .transform((v) => ({ ...v, weeklyTarget: v.scheduleKind === "weekly" ? v.weeklyTarget : null }));
export type HabitCreateInput = z.infer<typeof habitCreateSchema>;

export const habitUpdateSchema = z
  .object(habitFields)
  .partial()
  .extend({ archived: z.boolean().optional() })
  .superRefine(scheduleCheck)
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type HabitUpdateInput = z.infer<typeof habitUpdateSchema>;

export const checkinSchema = z.object({
  day: isoDate.optional(),
  /** null clears the day */
  status: z.enum(CHECKIN_STATUSES).nullable(),
  note: optionalText(500),
});

export const deleteSchema = z.object({ confirm: z.literal(true, "Confirm that the habit and its history should be deleted.") });

export const restDaySchema = z.object({ day: isoDate, reason: optionalText(200) });
