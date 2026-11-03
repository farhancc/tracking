import { z } from "zod";
import { patchOf } from "@/lib/validation";
import { isIsoDate } from "@/lib/domain/dates";
import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  BUSINESS_MODELS,
  categoryKind,
  FEATURE_PRIORITIES,
  FEATURE_STATUSES,
  FEEDBACK_KINDS,
  FEEDBACK_SOURCES,
  MILESTONE_STATUSES,
  PRODUCT_STAGES,
  PRODUCT_STATUSES,
  SENTIMENTS,
  TRANSACTION_CATEGORIES,
} from "@/lib/domain/products";
import { EVIDENCE_KINDS, STEP_STATUSES, VALIDATION_STEPS, VALUE_KINDS, WILLINGNESS } from "@/lib/domain/product-validation";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optDate = isoDate.nullish().transform((v) => v ?? null);
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const optUuid = z.uuid().nullish().transform((v) => v ?? null);
const count = z.coerce.number().int().min(0).max(100_000_000);
const amount = z.coerce.number().positive("Enter an amount above zero.").max(1e15).multipleOf(0.01, "Use at most two decimals.");
const score = z.coerce.number().int().min(1).max(5).nullish().transform((v) => v ?? null);

const optBoolFlag = z
  .union([z.boolean(), z.enum(["true", "false", "on"])])
  .transform((v) => v === true || v === "true" || v === "on")
  .optional();

const productFields = {
  name: z.string().trim().min(1, "Name the product.").max(120),
  description: optionalText(5000),
  targetCustomer: optionalText(1000),
  problem: optionalText(5000),
  valueProposition: optionalText(2000),
  businessModel: z.enum(BUSINESS_MODELS),
  pricing: optionalText(1000),
  stage: z.enum(PRODUCT_STAGES),
  status: z.enum(PRODUCT_STATUSES),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  acquisitionChannels: z.array(z.string().trim().min(1).max(80)).max(20),
  startedOn: isoDate,
  plannedLaunchOn: optDate,
  launchedOn: optDate,
  goalId: optUuid,
  statusNote: optionalText(2000),
};

export const productCreateSchema = z.object({
  ...productFields,
  businessModel: productFields.businessModel.default("subscription"),
  stage: productFields.stage.default("idea"),
  status: productFields.status.default("active"),
  currency: productFields.currency.optional(),
  acquisitionChannels: productFields.acquisitionChannels.default([]),
  startedOn: isoDate.optional(),
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export const productUpdateSchema = patchOf(z.object(productFields)).extend({
  archived: z.boolean().optional(),
  /** Enter MVP or later without demand evidence, knowingly (requires a statusNote). */
  acknowledgeUnvalidated: optBoolFlag,
});
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const metricSchema = z.object({
  /** "2026-10" (a month picker) or any date in the month. */
  month: z
    .string()
    .trim()
    .transform((d) => `${d.slice(0, 7)}-01`)
    .refine(isIsoDate, "Pick a month."),
  mrr: z.coerce.number().min(0).max(1e15).nullish().transform((v) => v ?? null),
  activeCustomers: count,
  newCustomers: count.default(0),
  churnedCustomers: count.default(0),
  notes: optionalText(2000),
});
export type MetricInput = z.infer<typeof metricSchema>;

export const transactionSchema = z.object({
  category: z.enum(TRANSACTION_CATEGORIES),
  amount,
  occurredOn: optDate,
  description: optionalText(500),
});
export const transactionUpdateSchema = patchOf(transactionSchema);
export type TransactionInput = z.infer<typeof transactionSchema>;
export const kindOf = categoryKind;

export const milestoneSchema = z.object({
  title: z.string().trim().min(1, "Name the milestone.").max(200),
  description: optionalText(5000),
  stage: z.enum(PRODUCT_STAGES).nullish().transform((v) => v ?? null),
  status: z.enum(MILESTONE_STATUSES).default("open"),
  dueOn: optDate,
  completedOn: optDate,
});
export const milestoneUpdateSchema = patchOf(milestoneSchema);

export const releaseSchema = z.object({
  version: z.string().trim().min(1, "Give the release a version.").max(40),
  title: optionalText(200),
  notes: optionalText(10000),
  plannedOn: optDate,
  releasedOn: optDate,
});
export const releaseUpdateSchema = patchOf(releaseSchema);

export const featureSchema = z.object({
  title: z.string().trim().min(1, "Name the feature.").max(200),
  description: optionalText(5000),
  status: z.enum(FEATURE_STATUSES).default("backlog"),
  priority: z.enum(FEATURE_PRIORITIES).default("should"),
  impact: score,
  effort: score,
  releaseId: optUuid,
  shippedOn: optDate,
});
export const featureUpdateSchema = patchOf(featureSchema);

export const feedbackSchema = z.object({
  receivedOn: optDate,
  customer: optionalText(200),
  source: z.enum(FEEDBACK_SOURCES).default("other"),
  kind: z.enum(FEEDBACK_KINDS),
  sentiment: z.enum(SENTIMENTS).default("neutral"),
  content: z.string().trim().min(1, "Write down what the customer said.").max(5000),
  featureId: optUuid,
});
export const feedbackUpdateSchema = patchOf(feedbackSchema);

export const bugSchema = z.object({
  title: z.string().trim().min(1, "Describe the bug.").max(200),
  description: optionalText(10000),
  severity: z.enum(BUG_SEVERITIES).default("medium"),
  status: z.enum(BUG_STATUSES).default("open"),
  reportedOn: optDate,
  fixedOn: optDate,
  releaseId: optUuid,
});
export const bugUpdateSchema = patchOf(bugSchema);

const httpUrl = z
  .string()
  .trim()
  .url("Use a full link starting with http(s)://.")
  .refine((u) => /^https?:\/\//.test(u), "Use an http(s) link.")
  .nullish()
  .transform((v) => v ?? null);
const optBool = z
  .union([z.boolean(), z.enum(["true", "false", "yes", "no", "on"])])
  .nullish()
  .transform((v) => (v == null ? null : v === true || v === "true" || v === "yes" || v === "on"));

export const interviewSchema = z.object({
  interviewedOn: optDate,
  customerName: optionalText(200),
  customerType: z.string().trim().min(1, "Say what kind of customer this is.").max(200),
  problem: optionalText(5000),
  confirmsProblem: optBool,
  painLevel: score,
  currentSolution: optionalText(5000),
  willingness: z.enum(WILLINGNESS).default("unclear"),
  statedPrice: z.coerce.number().min(0).max(1e12).nullish().transform((v) => v ?? null),
  objections: optionalText(5000),
  feedback: optionalText(10000),
  followUpOn: optDate,
  followUpDone: optBool.transform((v) => v ?? false),
});

export const competitorSchema = z.object({
  name: z.string().trim().min(1, "Name the competitor or alternative.").max(200),
  url: httpUrl,
  pricing: optionalText(1000),
  strengths: optionalText(5000),
  weaknesses: optionalText(5000),
  whyCustomersWouldSwitch: optionalText(5000),
});

export const evidenceSchema = z
  .object({
    step: z.enum(VALIDATION_STEPS),
    kind: z.enum(EVIDENCE_KINDS),
    observedOn: optDate,
    summary: z.string().trim().min(1, "Describe the evidence.").max(5000),
    value: z.coerce.number().min(-1e15).max(1e15).nullish().transform((v) => v ?? null),
    url: httpUrl,
  })
  .refine((e) => !VALUE_KINDS.includes(e.kind) || e.value != null, { path: ["value"], message: "This kind of evidence needs a number." });

export const stepUpdateSchema = z
  .object({
    status: z.enum(STEP_STATUSES),
    successCriteria: z.string().trim().min(1).max(2000),
    notes: optionalText(5000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type StepUpdateInput = z.infer<typeof stepUpdateSchema>;

export const reportQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });

export const COLLECTIONS = ["metrics", "transactions", "milestones", "releases", "features", "feedback", "bugs", "interviews", "competitors", "evidence"] as const;
export type Collection = (typeof COLLECTIONS)[number];
