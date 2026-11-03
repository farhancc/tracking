import { z } from "zod";
import { patchOf } from "@/lib/validation";
import { isIsoDate } from "@/lib/domain/dates";
import { MEASURE_UNITS } from "@/lib/domain/goals";
import { DELIVERABLE_STATUSES, DEPENDENCY_STATUSES, KPI_DIRECTIONS, RISK_STATUSES } from "@/lib/domain/roadmap";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const finite = z.number().refine(Number.isFinite, "Must be a number.");
const hours = z.number().min(0).max(10000).nullish().transform((v) => v ?? null);
const scale = z.number().int().min(1).max(5);
const refinePatch = <S extends z.ZodRawShape>(s: z.ZodObject<S>) => patchOf(s).refine((v) => Object.keys(v).length > 0, "Nothing to update.");

export const roadmapSettingsSchema = z.object({
  weeklyCapacityHours: z.number().min(0).max(120),
  applyToFutureQuarters: z.boolean().default(true),
});
export type RoadmapSettingsInput = z.infer<typeof roadmapSettingsSchema>;

export const yearUpdateSchema = refinePatch(
  z.object({
    theme: z.string().trim().min(1).max(120),
    direction: z.string().trim().min(1).max(2000),
    isProvisional: z.boolean(),
    notes: optionalText(5000),
  }),
);
export type YearUpdateInput = z.infer<typeof yearUpdateSchema>;

export const quarterUpdateSchema = refinePatch(
  z.object({
    focus: optionalText(500),
    capacityHoursPerWeek: z.number().min(0).max(120).nullable(),
    midReviewOn: isoDate.nullable(),
    reviewOn: isoDate.nullable(),
    reviewSummary: optionalText(10000),
    reviewed: z.boolean(),
  }),
);
export type QuarterUpdateInput = z.infer<typeof quarterUpdateSchema>;

const deliverableFields = z.object({
  title: z.string().trim().min(1, "Name the deliverable.").max(300),
  goalId: z.uuid().nullish().transform((v) => v ?? null),
  dueOn: isoDate.nullish().transform((v) => v ?? null),
  estimatedHours: hours,
  status: z.enum(DELIVERABLE_STATUSES).default("planned"),
  evidence: optionalText(2000),
  notes: optionalText(5000),
});
export const deliverableCreateSchema = deliverableFields;
export const deliverableUpdateSchema = refinePatch(deliverableFields);
export type DeliverableCreateInput = z.infer<typeof deliverableCreateSchema>;
export type DeliverableUpdateInput = z.infer<typeof deliverableUpdateSchema>;

const kpiFields = z.object({
  name: z.string().trim().min(1, "Name the KPI.").max(200),
  unit: z.enum(MEASURE_UNITS).default("number"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .nullish()
    .transform((v) => v ?? null),
  direction: z.enum(KPI_DIRECTIONS).default("up"),
  targetValue: finite,
  actualValue: finite.nullish().transform((v) => v ?? null),
  notes: optionalText(2000),
});
export const kpiCreateSchema = kpiFields.superRefine((k, ctx) => {
  if (k.unit === "currency" && !k.currency) ctx.addIssue({ code: "custom", path: ["currency"], message: "Money KPIs need a currency." });
});
export const kpiUpdateSchema = refinePatch(kpiFields);
export type KpiCreateInput = z.infer<typeof kpiCreateSchema>;
export type KpiUpdateInput = z.infer<typeof kpiUpdateSchema>;

const riskFields = z.object({
  title: z.string().trim().min(1, "Describe the risk.").max(300),
  likelihood: scale.default(3),
  impact: scale.default(3),
  mitigation: optionalText(2000),
  status: z.enum(RISK_STATUSES).default("open"),
  notes: optionalText(2000),
});
export const riskCreateSchema = riskFields;
export const riskUpdateSchema = refinePatch(riskFields);
export type RiskCreateInput = z.infer<typeof riskCreateSchema>;
export type RiskUpdateInput = z.infer<typeof riskUpdateSchema>;

const dependencyFields = z.object({
  description: z.string().trim().min(1, "Describe what you depend on.").max(500),
  dependsOnGoalId: z.uuid().nullish().transform((v) => v ?? null),
  neededBy: isoDate.nullish().transform((v) => v ?? null),
  status: z.enum(DEPENDENCY_STATUSES).default("open"),
  notes: optionalText(2000),
});
export const quarterDependencyCreateSchema = dependencyFields;
export const quarterDependencyUpdateSchema = refinePatch(dependencyFields);
export type QuarterDependencyCreateInput = z.infer<typeof quarterDependencyCreateSchema>;
export type QuarterDependencyUpdateInput = z.infer<typeof quarterDependencyUpdateSchema>;

export const quarterNumberSchema = z.coerce.number().int().min(1).max(20);
export const yearNumberSchema = z.coerce.number().int().min(1).max(5);
