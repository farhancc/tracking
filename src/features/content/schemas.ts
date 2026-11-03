import { z } from "zod";
import { CONTENT_STATUSES, FORMAT_LABELS, FORMATS, isFormatFor, METRIC_FIELDS, PLATFORMS, type Format, type Platform } from "@/lib/domain/content";
import { isIsoDate } from "@/lib/domain/dates";
import { patchOf } from "@/lib/validation";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optDate = isoDate.nullish().transform((v) => v ?? null);
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const optUuid = z.uuid().nullish().transform((v) => v ?? null);
const httpUrl = z
  .string()
  .trim()
  .url("Use a full link starting with http(s)://.")
  .refine((u) => /^https?:\/\//.test(u), "Use an http(s) link.")
  .nullish()
  .transform((v) => v ?? null);

export const brandSchema = z.object({
  positioning: z.string().trim().min(1, "Write your positioning.").max(2000),
  audience: optionalText(2000),
});

export const pillarCreateSchema = z.object({
  name: z.string().trim().min(1, "Name the pillar.").max(80),
  description: optionalText(1000),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});
export const pillarUpdateSchema = patchOf(pillarCreateSchema).extend({ archived: z.boolean().optional() });

const itemFields = {
  title: z.string().trim().min(1, "Give it a working title.").max(300),
  topic: optionalText(300),
  pillarId: optUuid,
  platform: z.enum(PLATFORMS).nullish().transform((v) => v ?? null),
  format: z.enum(FORMATS).nullish().transform((v) => v ?? null),
  status: z.enum(CONTENT_STATUSES),
  hook: optionalText(1000),
  script: optionalText(50_000),
  notes: optionalText(10_000),
  plannedRecordOn: optDate,
  scheduledOn: optDate,
  recordedOn: optDate,
  publishedOn: optDate,
  publishedUrl: httpUrl,
  reviewNotes: optionalText(10_000),
  repurposedFromId: optUuid,
};

const formatCheck = (v: { platform?: Platform | null; format?: Format | null }, ctx: z.RefinementCtx) => {
  if (v.platform && v.format && !isFormatFor(v.platform, v.format)) {
    ctx.addIssue({ code: "custom", path: ["format"], message: `${FORMAT_LABELS[v.format]} isn't a ${v.platform} format.` });
  }
};

export const itemCreateSchema = z.object({ ...itemFields, status: itemFields.status.default("idea") }).superRefine(formatCheck);
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export const itemUpdateSchema = patchOf(z.object(itemFields))
  .extend({ archived: z.boolean().optional() })
  .superRefine(formatCheck)
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

export const repurposeSchema = z
  .object({ platform: z.enum(PLATFORMS), format: z.enum(FORMATS), title: optionalText(300) })
  .superRefine(formatCheck);

export const sourceSchema = z.object({
  title: z.string().trim().min(1, "Name the source.").max(300),
  url: httpUrl,
  notes: optionalText(5000),
});

const metricNumber = z.coerce.number().min(0).max(1e13).nullish().transform((v) => v ?? null);
export const metricSchema = z
  .object({
    capturedOn: optDate,
    notes: optionalText(2000),
    ...Object.fromEntries(METRIC_FIELDS.map((f) => [f, metricNumber])),
  })
  .superRefine((v, ctx) => {
    const r = v as Record<string, unknown>;
    for (const f of ["avgRetentionPct", "completionRatePct"]) {
      if (typeof r[f] === "number" && (r[f] as number) > 100) ctx.addIssue({ code: "custom", path: [f], message: "Percentages are 0–100." });
    }
    if (!METRIC_FIELDS.some((f) => r[f] != null)) ctx.addIssue({ code: "custom", path: ["views"], message: "Enter at least one number from the platform's insights." });
  });
export type MetricInput = { capturedOn: string | null; notes: string | null } & Partial<Record<(typeof METRIC_FIELDS)[number], number | null>>;

export const itemQuerySchema = z.object({
  status: z.enum(CONTENT_STATUSES).optional(),
  pillarId: z.uuid().optional(),
  platform: z.enum(PLATFORMS).optional(),
  q: z.string().trim().max(100).optional(),
  ideas: z.enum(["true", "false"]).optional(),
});
export type ItemQuery = z.infer<typeof itemQuerySchema>;

export const calendarQuerySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM.").optional() });
