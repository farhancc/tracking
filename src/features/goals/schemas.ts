/**
 * Input schemas shared by the REST API and the Server Actions.
 * Note what is NOT accepted: user_id (from the session), current_value and
 * completion_pct (derived from measurements in the database).
 */
import { z } from "zod";
import { isIsoDate, isValidTimeZone } from "@/lib/domain/dates";
import {
  GOAL_CATEGORIES,
  GOAL_LEVELS,
  GOAL_STATUSES,
  LINK_KINDS,
  MEASURE_UNITS,
  MEASUREMENT_MODES,
  TASK_STATUSES,
} from "@/lib/domain/goals";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const finite = z.number().refine(Number.isFinite, "Must be a number.");
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a three-letter currency code such as USD, EUR or INR.");

const goalFields = {
  title: z.string().trim().min(1, "Give the goal a title.").max(200),
  description: optionalText(5000),
  pillarId: z.uuid("Choose a pillar."),
  level: z.enum(GOAL_LEVELS),
  category: z.enum(GOAL_CATEGORIES).nullish().transform((v) => v ?? null),
  parentId: z.uuid().nullish().transform((v) => v ?? null),
  startDate: isoDate,
  targetDate: isoDate,
  priority: z.number().int().min(1).max(4),
  status: z.enum(GOAL_STATUSES),
  successMetric: z.string().trim().min(1, "Describe how success is measured.").max(200),
  unit: z.enum(MEASURE_UNITS),
  currency: currency.nullish().transform((v) => v ?? null),
  measurementMode: z.enum(MEASUREMENT_MODES),
  baselineValue: finite,
  targetValue: finite,
  notes: optionalText(20000),
  sortOrder: z.number().int(),
};

type GoalShape = {
  level?: (typeof GOAL_LEVELS)[number];
  category?: string | null;
  parentId?: string | null;
  startDate?: string;
  targetDate?: string;
  unit?: string;
  currency?: string | null;
  baselineValue?: number;
  targetValue?: number;
  measurementMode?: string;
};

function refineGoal(goal: GoalShape, ctx: z.RefinementCtx) {
  if (goal.startDate && goal.targetDate && goal.targetDate < goal.startDate) {
    ctx.addIssue({ code: "custom", path: ["targetDate"], message: "The target date must be on or after the start date." });
  }
  if (goal.level === "five_year") {
    if (goal.parentId) ctx.addIssue({ code: "custom", path: ["parentId"], message: "Five-year goals sit at the top and have no parent." });
    if (!goal.category) ctx.addIssue({ code: "custom", path: ["category"], message: "Choose which part of your vision this goal measures." });
  }
  if (goal.unit === "currency" && !goal.currency) {
    ctx.addIssue({ code: "custom", path: ["currency"], message: "Money goals need a currency." });
  }
  if (goal.unit === "boolean") {
    for (const key of ["baselineValue", "targetValue"] as const) {
      const v = goal[key];
      if (v !== undefined && v !== 0 && v !== 1) {
        ctx.addIssue({ code: "custom", path: [key], message: "Yes/no goals use 0 (no) or 1 (yes)." });
      }
    }
    if (goal.measurementMode === "cumulative") {
      ctx.addIssue({ code: "custom", path: ["measurementMode"], message: "Yes/no goals use the latest value." });
    }
  }
  if (goal.baselineValue !== undefined && goal.targetValue !== undefined && goal.baselineValue === goal.targetValue && goal.unit !== "boolean") {
    ctx.addIssue({ code: "custom", path: ["targetValue"], message: "The target must differ from the baseline, otherwise there is nothing to achieve." });
  }
}

export const goalCreateSchema = z
  .object({
    ...goalFields,
    priority: goalFields.priority.default(3),
    status: goalFields.status.default("not_started"),
    unit: goalFields.unit.default("number"),
    measurementMode: goalFields.measurementMode.default("latest"),
    baselineValue: goalFields.baselineValue.default(0),
    sortOrder: goalFields.sortOrder.default(0),
  })
  .superRefine(refineGoal);
export type GoalCreateInput = z.infer<typeof goalCreateSchema>;

export const goalUpdateSchema = z
  .object(goalFields)
  .partial()
  .superRefine(refineGoal)
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type GoalUpdateInput = z.infer<typeof goalUpdateSchema>;

export const goalListQuerySchema = z.object({
  level: z.enum(GOAL_LEVELS).optional(),
  pillarId: z.uuid().optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  parentId: z.union([z.literal("root"), z.uuid()]).optional(),
  q: z.string().trim().max(100).optional(),
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export type GoalListQuery = z.infer<typeof goalListQuerySchema>;

export const measurementCreateSchema = z.object({
  measuredOn: isoDate,
  value: finite,
  note: optionalText(2000),
  source: z.enum(["manual", "import"]).default("manual"),
});
export type MeasurementCreateInput = z.infer<typeof measurementCreateSchema>;

export const dependencyCreateSchema = z.object({
  dependsOnGoalId: z.uuid("Choose the prerequisite goal."),
  isBlocking: z.boolean().default(true),
  note: optionalText(1000),
});
export type DependencyCreateInput = z.infer<typeof dependencyCreateSchema>;

export const linkCreateSchema = z.object({
  relatedGoalId: z.uuid("Choose the related goal."),
  kind: z.enum(LINK_KINDS).default("related"),
  note: optionalText(1000),
});
export type LinkCreateInput = z.infer<typeof linkCreateSchema>;

export const visionSaveSchema = z.object({
  title: z.string().trim().min(1).max(200).default("Five-year vision"),
  statement: z.string().trim().min(1, "Write your five-year vision.").max(20000),
  professionalIdentity: optionalText(5000),
  exitStrategy: optionalText(10000),
});
export type VisionSaveInput = z.infer<typeof visionSaveSchema>;

export const journeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(120).default("My five-year journey"),
  startDate: isoDate,
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone."),
  baseCurrency: currency,
  weekStartsOn: z.number().int().min(0).max(6).default(1),
  displayName: optionalText(120),
});
export type JourneyCreateInput = z.infer<typeof journeyCreateSchema>;

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(300),
  goalId: z.uuid().nullish().transform((v) => v ?? null),
  dueOn: isoDate.nullish().transform((v) => v ?? null),
  notes: optionalText(5000),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    status: z.enum(TASK_STATUSES),
    dueOn: isoDate.nullable(),
    notes: optionalText(5000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
