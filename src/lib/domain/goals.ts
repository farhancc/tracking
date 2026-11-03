/**
 * Five-year strategic goal engine: domain rules.
 *
 * Pure TypeScript (no React, no database, no Next.js) so the rules can be unit
 * tested and reused by the UI, the API and the database integration tests.
 * The database enforces the same rules (see drizzle/0002_goal_engine_rules.sql);
 * these functions give fast feedback and drive the UI.
 *
 * Core principle: a strategic goal is measured by its OUTCOME, the success
 * metric moving from baseline to target. Completed tasks and achieved sub-goals
 * are shown as activity, but never change a goal's progress or status.
 */
import {
  addDays,
  addMonths,
  addYears,
  diffDays,
  maxDate,
  minDate,
  startOfWeek,
  type IsoDate,
} from "./dates";

// ---------------------------------------------------------------------------
// Vocabularies (single source of truth for DB check constraints, Zod and UI)
// ---------------------------------------------------------------------------

export const GOAL_LEVELS = [
  "five_year",
  "annual",
  "quarterly",
  "monthly",
  "weekly",
  "daily",
] as const;
export type GoalLevel = (typeof GOAL_LEVELS)[number];

export const GOAL_LEVEL_LABELS: Record<GoalLevel, string> = {
  five_year: "Five-year vision",
  annual: "Annual objective",
  quarterly: "Quarterly objective",
  monthly: "Monthly target",
  weekly: "Weekly goal",
  daily: "Daily action",
};

export const GOAL_CATEGORIES = [
  "financial",
  "business_ownership",
  "professional_identity",
  "skill_mastery",
  "personal_brand",
  "exit_condition",
  "other",
] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {
  financial: "Financial target",
  business_ownership: "Business ownership",
  professional_identity: "Professional identity",
  skill_mastery: "Skill to master",
  personal_brand: "Personal brand",
  exit_condition: "Retirement / employment exit condition",
  other: "Other",
};

export const GOAL_CATEGORY_HINTS: Record<GoalCategory, string> = {
  financial: "e.g. Net worth reaches 10,000,000 by the end of year 5",
  business_ownership: "e.g. Own a software company with 200 paying customers",
  professional_identity: "e.g. Recognised as a top-1% B2B closer: 3 industry awards or invitations",
  skill_mastery: "e.g. Negotiation skill self-assessed and mentor-rated at 9/10",
  personal_brand: "e.g. 100,000 followers across LinkedIn and YouTube",
  exit_condition: "e.g. Own-business income ≥ salary for 6 consecutive months",
  other: "Any other five-year outcome",
};

export const GOAL_STATUSES = [
  "not_started",
  "in_progress",
  "at_risk",
  "on_hold",
  "achieved",
  "missed",
  "abandoned",
] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  at_risk: "At risk",
  on_hold: "On hold",
  achieved: "Achieved",
  missed: "Missed",
  abandoned: "Abandoned",
};

export const CLOSED_STATUSES: readonly GoalStatus[] = ["achieved", "missed", "abandoned"];

export const GOAL_PRIORITIES = [1, 2, 3, 4] as const;
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];
export const GOAL_PRIORITY_LABELS: Record<GoalPriority, string> = {
  1: "Critical",
  2: "High",
  3: "Medium",
  4: "Low",
};

export const MEASURE_UNITS = ["number", "count", "currency", "percent", "hours", "boolean"] as const;
export type MeasureUnit = (typeof MEASURE_UNITS)[number];
export const MEASURE_UNIT_LABELS: Record<MeasureUnit, string> = {
  number: "Number",
  count: "Count",
  currency: "Money",
  percent: "Percent",
  hours: "Hours",
  boolean: "Yes / no",
};

export const MEASUREMENT_MODES = ["latest", "cumulative", "key_results"] as const;
export type MeasurementMode = (typeof MEASUREMENT_MODES)[number];
export const MEASUREMENT_MODE_LABELS: Record<MeasurementMode, string> = {
  latest: "Latest value (a level, e.g. net worth, followers)",
  cumulative: "Running total (logged amounts add up, e.g. revenue, calls)",
  key_results: "From key results (average outcome progress of its key results)",
};

/** Objectives measured by their key results always run 0 → 100 percent. */
export const KEY_RESULTS_SCALE = { unit: "percent", baselineValue: 0, targetValue: 100 } as const;

export const MEASUREMENT_SOURCES = ["manual", "import", "metric", "system"] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

export const LINK_KINDS = ["related", "synergy", "tradeoff"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  related: "Related",
  synergy: "Reinforces",
  tradeoff: "Trade-off",
};

export const TASK_STATUSES = ["todo", "doing", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// ---------------------------------------------------------------------------
// Hierarchy
// ---------------------------------------------------------------------------

/** 1 = five_year … 6 = daily. Mirrors app.goal_level_rank() in SQL. */
export function levelRank(level: GoalLevel): number {
  return GOAL_LEVELS.indexOf(level) + 1;
}

/**
 * A child must sit strictly deeper than its parent (levels may be skipped).
 * A key result may sit at the same level as the objective it measures.
 */
export function isValidParentLevel(parent: GoalLevel, child: GoalLevel, childIsKeyResult = false): boolean {
  return childIsKeyResult ? levelRank(parent) <= levelRank(child) : levelRank(parent) < levelRank(child);
}

export function childLevelsFor(level: GoalLevel): GoalLevel[] {
  return GOAL_LEVELS.slice(levelRank(level));
}

export function defaultChildLevel(level: GoalLevel): GoalLevel | null {
  return childLevelsFor(level)[0] ?? null;
}

export function parentLevelsFor(level: GoalLevel): GoalLevel[] {
  return GOAL_LEVELS.slice(0, levelRank(level) - 1);
}

export type TreeNode<T> = T & { children: TreeNode<T>[] };

/** Builds a forest from flat rows. Orphans (parent missing/archived) become roots. */
export function buildTree<T extends { id: string; parentId: string | null }>(
  rows: T[],
  compare?: (a: T, b: T) => number,
): TreeNode<T>[] {
  const nodes = new Map<string, TreeNode<T>>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [] });
  const roots: TreeNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  if (compare) {
    const sortRec = (list: TreeNode<T>[]) => {
      list.sort(compare);
      list.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Outcome measurement
// ---------------------------------------------------------------------------

export type OutcomeValues = {
  baselineValue: number;
  targetValue: number;
  currentValue: number;
};

/** Increase goals: target ≥ baseline. Decrease goals (e.g. debt): target < baseline. */
export function goalDirection(v: Pick<OutcomeValues, "baselineValue" | "targetValue">): "increase" | "decrease" {
  return v.targetValue >= v.baselineValue ? "increase" : "decrease";
}

/** Mirrors the generated column goals.is_target_met. */
export function isTargetMet(v: OutcomeValues): boolean {
  return goalDirection(v) === "increase"
    ? v.currentValue >= v.targetValue
    : v.currentValue <= v.targetValue;
}

/**
 * Outcome completion 0–100, rounded to one decimal.
 * Mirrors the generated column goals.completion_pct exactly.
 */
export function completionPercent(v: OutcomeValues): number {
  const span = v.targetValue - v.baselineValue;
  if (span === 0) return v.currentValue === v.targetValue ? 100 : 0;
  const raw = ((v.currentValue - v.baselineValue) / span) * 100;
  return Math.round(Math.min(100, Math.max(0, raw)) * 10) / 10;
}

/** Share of the goal's period that has elapsed, 0–100. */
export function expectedPercent(
  period: { startDate: IsoDate; targetDate: IsoDate },
  today: IsoDate,
): number {
  if (today < period.startDate) return 0;
  if (today >= period.targetDate) return 100;
  const total = diffDays(period.startDate, period.targetDate) + 1;
  const elapsed = diffDays(period.startDate, today) + 1;
  return Math.round((elapsed / total) * 1000) / 10;
}

export type GoalHealth =
  | "achieved"
  | "closed"
  | "target_met"
  | "upcoming"
  | "on_track"
  | "at_risk"
  | "off_track"
  | "overdue";

export const GOAL_HEALTH_LABELS: Record<GoalHealth, string> = {
  achieved: "Achieved",
  closed: "Closed",
  target_met: "Target met: confirm achievement",
  upcoming: "Starts later",
  on_track: "On track",
  at_risk: "Behind pace",
  off_track: "Off track",
  overdue: "Past target date",
};

/**
 * Health compares OUTCOME progress with time elapsed. It is advisory and
 * separate from the owner-controlled status.
 */
export function goalHealth(
  goal: OutcomeValues & { status: GoalStatus; startDate: IsoDate; targetDate: IsoDate },
  today: IsoDate,
): GoalHealth {
  if (goal.status === "achieved") return "achieved";
  if (goal.status === "missed" || goal.status === "abandoned") return "closed";
  if (isTargetMet(goal)) return "target_met";
  if (today < goal.startDate) return "upcoming";
  if (today > goal.targetDate) return "overdue";
  const expected = expectedPercent(goal, today);
  const actual = completionPercent(goal);
  if (expected <= 10) return "on_track"; // too early to judge pace
  const ratio = actual / expected;
  if (ratio >= 0.9) return "on_track";
  if (ratio >= 0.6) return "at_risk";
  return "off_track";
}

// ---------------------------------------------------------------------------
// Achievement rules
// ---------------------------------------------------------------------------

export type Prerequisite = {
  goalId: string;
  title: string;
  status: GoalStatus;
  isBlocking: boolean;
};

export function unmetBlockingPrerequisites(prereqs: Prerequisite[]): Prerequisite[] {
  return prereqs.filter((p) => p.isBlocking && p.status !== "achieved");
}

export type AchievementCheck = { allowed: true } | { allowed: false; reasons: string[] };

/**
 * A goal may be marked achieved only when its success metric has reached the
 * target AND every blocking prerequisite is achieved. Task completion and
 * sub-goal achievement are deliberately NOT inputs.
 */
export function canMarkAchieved(goal: OutcomeValues, prereqs: Prerequisite[]): AchievementCheck {
  const reasons: string[] = [];
  if (!isTargetMet(goal)) {
    reasons.push(
      `The success metric is at ${formatNumber(goal.currentValue)}, short of the target ${formatNumber(goal.targetValue)}. Log a measurement that reaches the target first.`,
    );
  }
  const blockers = unmetBlockingPrerequisites(prereqs);
  if (blockers.length > 0) {
    reasons.push(`Blocked by prerequisites not yet achieved: ${blockers.map((b) => b.title).join(", ")}.`);
  }
  return reasons.length === 0 ? { allowed: true } : { allowed: false, reasons };
}

// ---------------------------------------------------------------------------
// Informational roll-ups (activity, never progress)
// ---------------------------------------------------------------------------

export function summarizeChildren(children: { status: GoalStatus }[]) {
  return {
    total: children.length,
    achieved: children.filter((c) => c.status === "achieved").length,
    open: children.filter((c) => !CLOSED_STATUSES.includes(c.status)).length,
  };
}

export function summarizeTasks(tasks: { status: TaskStatus }[]) {
  const counted = tasks.filter((t) => t.status !== "cancelled");
  return {
    total: counted.length,
    done: counted.filter((t) => t.status === "done").length,
  };
}

// ---------------------------------------------------------------------------
// Period suggestions for new goals
// ---------------------------------------------------------------------------

/**
 * Suggests a start and target date for a new goal at `level`, anchored on
 * `anchor` (usually today or the parent's start) and clamped to `bounds`
 * (the parent's period, or the journey).
 */
export function suggestPeriod(
  level: GoalLevel,
  anchor: IsoDate,
  bounds: { startDate: IsoDate; targetDate: IsoDate },
  weekStartsOn = 1,
): { startDate: IsoDate; targetDate: IsoDate } {
  const start = minDate(maxDate(anchor, bounds.startDate), bounds.targetDate);
  let from = start;
  let to: IsoDate;
  switch (level) {
    case "five_year":
      to = addDays(addYears(start, 5), -1);
      break;
    case "annual":
      to = addDays(addYears(start, 1), -1);
      break;
    case "quarterly":
      to = addDays(addMonths(start, 3), -1);
      break;
    case "monthly":
      to = addDays(addMonths(start, 1), -1);
      break;
    case "weekly":
      from = startOfWeek(start, weekStartsOn);
      to = addDays(from, 6);
      break;
    case "daily":
      to = start;
      break;
  }
  return {
    startDate: maxDate(from, bounds.startDate),
    targetDate: minDate(to, bounds.targetDate),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

export function formatMeasure(value: number, unit: MeasureUnit, currency?: string | null): string {
  switch (unit) {
    case "currency":
      try {
        return new Intl.NumberFormat("en", {
          style: "currency",
          currency: currency ?? "USD",
          maximumFractionDigits: 0,
        }).format(value);
      } catch {
        return `${formatNumber(value)} ${currency ?? ""}`.trim();
      }
    case "percent":
      return `${formatNumber(value)}%`;
    case "hours":
      return `${formatNumber(value)} h`;
    case "boolean":
      return value >= 1 ? "Yes" : "No";
    default:
      return formatNumber(value);
  }
}
