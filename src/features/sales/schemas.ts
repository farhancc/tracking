import { z } from "zod";
import { isIsoDate } from "@/lib/domain/dates";
import {
  ACTIVITY_KINDS,
  CALL_OUTCOMES,
  CHANNELS,
  DEAL_STAGES,
  JOURNAL_KINDS,
  PROSPECT_STATUSES,
  SALES_METRICS,
  SALES_PERIODS,
} from "@/lib/domain/sales";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code.");
const id = z.uuid().nullish().transform((v) => v ?? null);
const money = z.number().refine(Number.isFinite).min(0);

export const trackCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currency,
  description: optionalText(1000),
  isDefault: z.boolean().default(false),
});
export const trackUpdateSchema = trackCreateSchema.partial().extend({ archived: z.boolean().optional() });

export const activityCreateSchema = z
  .object({
    trackId: id,
    prospectId: id,
    dealId: id,
    kind: z.enum(ACTIVITY_KINDS),
    channel: z.enum(CHANNELS).nullish().transform((v) => v ?? null),
    /** Cold-call shortcut: sets the outcome flags as a ladder. */
    outcome: z.enum(CALL_OUTCOMES).nullish().transform((v) => v ?? null),
    connected: z.boolean().default(false),
    reachedDecisionMaker: z.boolean().default(false),
    qualified: z.boolean().default(false),
    meetingBooked: z.boolean().default(false),
    amount: money.nullish().transform((v) => v ?? null),
    currency: currency.nullish().transform((v) => v ?? null),
    occurredOn: isoDate.nullish().transform((v) => v ?? null),
    durationMinutes: z.number().int().min(0).max(1440).nullish().transform((v) => v ?? null),
    notes: optionalText(5000),
  })
  .superRefine((a, ctx) => {
    if (a.kind === "quotation" && a.amount === null) ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter the quoted amount." });
    if (a.kind !== "quotation" && a.amount !== null) ctx.addIssue({ code: "custom", path: ["amount"], message: "Only quotations carry an amount." });
  });
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;

export const prospectCreateSchema = z.object({
  trackId: id,
  name: z.string().trim().min(1, "Name the prospect.").max(200),
  company: optionalText(200),
  role: optionalText(200),
  email: optionalText(320),
  phone: optionalText(50),
  source: optionalText(200),
  status: z.enum(PROSPECT_STATUSES).default("new"),
  nextFollowUpOn: isoDate.nullish().transform((v) => v ?? null),
  notes: optionalText(5000),
});
export const prospectUpdateSchema = prospectCreateSchema.partial().extend({ archived: z.boolean().optional() });
export type ProspectCreateInput = z.infer<typeof prospectCreateSchema>;

export const dealCreateSchema = z.object({
  trackId: id,
  prospectId: id,
  title: z.string().trim().min(1, "Name the deal.").max(200),
  stage: z.enum(DEAL_STAGES).default("qualified"),
  amount: money.nullish().transform((v) => v ?? null),
  currency: currency.nullish().transform((v) => v ?? null),
  expectedCloseOn: isoDate.nullish().transform((v) => v ?? null),
  closedOn: isoDate.nullish().transform((v) => v ?? null),
  lostReason: optionalText(1000),
  notes: optionalText(5000),
});
export const dealUpdateSchema = dealCreateSchema.partial();
export type DealCreateInput = z.infer<typeof dealCreateSchema>;
export type DealUpdateInput = z.infer<typeof dealUpdateSchema>;

export const targetSetSchema = z.object({
  trackId: z.uuid(),
  metric: z.enum(SALES_METRICS),
  period: z.enum(SALES_PERIODS),
  targetValue: z.number().min(0).nullable(), // null removes the target from effectiveFrom on
  effectiveFrom: isoDate.nullish().transform((v) => v ?? null),
});
export type TargetSetInput = z.infer<typeof targetSetSchema>;

export const dashboardQuerySchema = z.object({
  period: z.enum(SALES_PERIODS).default("week"),
  anchor: isoDate.optional(),
  trackId: z.uuid().optional(),
});

export const journalCreateSchema = z.object({
  kind: z.enum(JOURNAL_KINDS),
  title: z.string().trim().min(1, "Give the entry a title.").max(200),
  occurredOn: isoDate.nullish().transform((v) => v ?? null),
  trackId: id,
  prospectId: id,
  situation: optionalText(5000),
  response: optionalText(5000),
  worked: z.boolean().nullish().transform((v) => v ?? null),
  lesson: optionalText(5000),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
});
export const journalUpdateSchema = journalCreateSchema.partial();
export type JournalCreateInput = z.infer<typeof journalCreateSchema>;

export const journalQuerySchema = z.object({
  kind: z.enum(JOURNAL_KINDS).optional(),
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(40).optional(),
});
