import { z } from "zod";
import { isIsoDate } from "@/lib/domain/dates";
import { APPLICATION_OUTCOMES, EVIDENCE_LEVELS, PSYCH_CATEGORIES, REVIEW_RATINGS, SOURCE_TYPES, UNDERSTANDING_LEVELS } from "@/lib/domain/psychology";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

const conceptFields = {
  category: z.enum(PSYCH_CATEGORIES),
  concept: z.string().trim().min(1, "Name the concept.").max(200),
  explanation: z.string().trim().min(1, "Explain it in your own words.").max(20000),
  sourceTitle: optionalText(300),
  sourceAuthor: optionalText(200),
  sourceUrl: z
    .string()
    .trim()
    .url("Use a full link starting with http(s)://.")
    .refine((u) => /^https?:\/\//.test(u), "Use an http(s) link.")
    .nullish()
    .transform((v) => v ?? null),
  sourceType: z.enum(SOURCE_TYPES),
  evidenceLevel: z.enum(EVIDENCE_LEVELS),
  evidenceNotes: optionalText(5000),
  example: optionalText(5000),
  ethics: optionalText(5000),
  whereToApply: optionalText(5000),
  observations: optionalText(10000),
  takeaways: optionalText(5000),
  understanding: z.enum(UNDERSTANDING_LEVELS),
  learnedOn: isoDate,
};

export const conceptCreateSchema = z.object({
  ...conceptFields,
  sourceType: conceptFields.sourceType.default("popular_book"),
  evidenceLevel: conceptFields.evidenceLevel.default("practitioner"),
  understanding: conceptFields.understanding.default("new"),
  learnedOn: conceptFields.learnedOn.nullish().transform((v) => v ?? null),
});
export type ConceptCreateInput = z.infer<typeof conceptCreateSchema>;

export const conceptUpdateSchema = z
  .object(conceptFields)
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type ConceptUpdateInput = z.infer<typeof conceptUpdateSchema>;

export const reviewSchema = z.object({ rating: z.enum(REVIEW_RATINGS) });

export const applicationCreateSchema = z.object({
  appliedOn: isoDate.nullish().transform((v) => v ?? null),
  context: z.string().trim().min(1, "Where did you apply it?").max(1000),
  action: optionalText(5000),
  result: optionalText(5000),
  outcome: z.enum(APPLICATION_OUTCOMES).default("inconclusive"),
});
export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;

export const conceptQuerySchema = z.object({
  category: z.enum(PSYCH_CATEGORIES).optional(),
  evidence: z.enum(EVIDENCE_LEVELS).optional(),
  understanding: z.enum(UNDERSTANDING_LEVELS).optional(),
  q: z.string().trim().max(100).optional(),
});
