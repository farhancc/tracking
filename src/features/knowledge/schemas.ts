import { z } from "zod";
import { isIsoDate } from "@/lib/domain/dates";
import { APPLICATION_STATUSES, RESOURCE_KINDS, RESOURCE_STATUSES } from "@/lib/domain/knowledge";
import { PSYCH_CATEGORIES } from "@/lib/domain/psychology";
import { patchOf } from "@/lib/validation";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optDate = isoDate.nullish().transform((v) => v ?? null);
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const optInt = (max: number) => z.coerce.number().int().min(0).max(max).nullish().transform((v) => v ?? null);
const httpUrl = z
  .string()
  .trim()
  .url("Use a full link starting with http(s)://.")
  .refine((u) => /^https?:\/\//.test(u), "Use an http(s) link.")
  .nullish()
  .transform((v) => v ?? null);

const resourceFields = {
  kind: z.enum(RESOURCE_KINDS),
  title: z.string().trim().min(1, "Give it a title.").max(300),
  author: optionalText(300),
  category: optionalText(100),
  url: httpUrl,
  status: z.enum(RESOURCE_STATUSES),
  startedOn: optDate,
  completedOn: optDate,
  rating: z.coerce.number().int().min(1).max(5).nullish().transform((v) => v ?? null),
  notes: optionalText(100_000),
  totalUnits: optInt(1_000_000).refine((v) => v == null || v > 0, "Must be above zero."),
  progressUnits: optInt(1_000_000),
  goalId: z.uuid().nullish().transform((v) => v ?? null),
};

export const resourceCreateSchema = z.object({ ...resourceFields, status: resourceFields.status.default("want") });
export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>;
export const resourceUpdateSchema = patchOf(z.object(resourceFields))
  .extend({ archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>;

export const resourceQuerySchema = z.object({
  kind: z.enum(RESOURCE_KINDS).optional(),
  status: z.enum(RESOURCE_STATUSES).optional(),
  category: z.string().trim().max(100).optional(),
  q: z.string().trim().max(100).optional(),
});
export type ResourceQuery = z.infer<typeof resourceQuerySchema>;

export const conceptSchema = z.object({
  concept: z.string().trim().min(1, "Name the concept.").max(300),
  explanation: optionalText(10_000),
});

export const promoteSchema = z.object({ category: z.enum(PSYCH_CATEGORIES) });

export const applicationCreateSchema = z.object({
  description: z.string().trim().min(1, "Say how you'll apply it.").max(2000),
  conceptId: z.uuid().nullish().transform((v) => v ?? null),
  /** Create a practice task for this (in this week's plan). */
  createTask: z
    .union([z.boolean(), z.enum(["on", "true", "false"])])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true"),
  journalEntryId: z.uuid().nullish().transform((v) => v ?? null),
});

export const applicationUpdateSchema = z
  .object({
    description: z.string().trim().min(1).max(2000),
    status: z.enum(APPLICATION_STATUSES),
    result: optionalText(10_000),
    appliedOn: optDate,
    journalEntryId: z.uuid().nullish().transform((v) => v ?? null),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");

/** Write the lesson straight into the sales journal and link it. */
export const journalFromApplicationSchema = z.object({
  title: z.string().trim().min(1, "Give the entry a title.").max(200),
  situation: optionalText(5000),
  response: optionalText(5000),
  worked: z
    .enum(["yes", "no", ""])
    .nullish()
    .transform((v) => (v === "yes" ? true : v === "no" ? false : null)),
  lesson: optionalText(5000),
});

export const goalSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  targetCount: optInt(1000).refine((v) => v == null || v >= 1, "At least 1."),
  kinds: z.array(z.enum(RESOURCE_KINDS)).min(1, "Pick at least one kind.").default(["book"]),
  dailyMinutes: optInt(1440).refine((v) => v == null || v >= 1, "At least 1 minute."),
});

export const sessionSchema = z.object({
  readOn: optDate,
  minutes: z.coerce.number().int().min(1, "At least 1 minute.").max(1440),
  units: optInt(100_000),
  resourceId: z.uuid().nullish().transform((v) => v ?? null),
  note: optionalText(1000),
  /** Also move the resource's progress to this page / lesson. */
  progressTo: optInt(1_000_000),
});
export type SessionInput = z.infer<typeof sessionSchema>;
