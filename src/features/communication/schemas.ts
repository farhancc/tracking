import { z } from "zod";
import { isIsoDate } from "@/lib/domain/dates";
import { ASSESSMENT_METHODS, RESOURCE_KINDS } from "@/lib/domain/communication";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const id = z.uuid().nullish().transform((v) => v ?? null);

export const skillUpdateSchema = z
  .object({ targetLevel: z.number().int().min(1).max(10), description: optionalText(1000) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");

export const exerciseCreateSchema = z.object({
  skillId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  instructions: optionalText(5000),
  durationMinutes: z.number().int().min(1).max(240).nullish().transform((v) => v ?? null),
  isDaily: z.boolean().default(false),
});

export const resourceCreateSchema = z.object({
  skillId: z.uuid(),
  kind: z.enum(RESOURCE_KINDS).default("other"),
  title: z.string().trim().min(1).max(300),
  url: z
    .string()
    .trim()
    .url("Use a full link starting with http:// or https://.")
    .refine((u) => /^https?:\/\//.test(u), "Use an http(s) link.")
    .nullish()
    .transform((v) => v ?? null),
  notes: optionalText(2000),
});

export const practiceCreateSchema = z
  .object({
    exerciseId: id,
    skillId: id,
    practicedOn: isoDate.nullish().transform((v) => v ?? null),
    durationMinutes: z.number().int().min(0).max(600).nullish().transform((v) => v ?? null),
    selfRating: z.number().int().min(1).max(5).nullish().transform((v) => v ?? null),
    notes: optionalText(5000),
    content: optionalText(20000),
    words: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    recordingId: id,
  })
  .refine((v) => v.exerciseId || v.skillId, "Choose an exercise or a skill.");
export type PracticeCreateInput = z.infer<typeof practiceCreateSchema>;

export const assessmentCreateSchema = z.object({
  skillId: z.uuid(),
  level: z.number().int().min(1, "Rate 1–10.").max(10, "Rate 1–10."),
  method: z.enum(ASSESSMENT_METHODS).default("self"),
  assessor: optionalText(200),
  evidence: z.string().trim().min(3, "Say what the rating is based on.").max(5000),
  recordingId: id,
  assessedOn: isoDate.nullish().transform((v) => v ?? null),
  notes: optionalText(2000),
});
export type AssessmentCreateInput = z.infer<typeof assessmentCreateSchema>;
