/**
 * Annual and quarterly roadmap: pure rules.
 *
 * The journey is split into 5 annual plans and 20 quarterly execution cycles.
 * The generator only creates periods, dates and PROVISIONAL directions. It
 * never invents numeric targets: targets come from the owner and are
 * sanity-checked against available time and past delivery (assessQuarterPlan).
 */
import { addDays, addMonths, addYears, diffDays, type IsoDate } from "./dates";
import type { MeasureUnit } from "./goals";

export const YEARS_PER_JOURNEY = 5;
export const QUARTERS_PER_YEAR = 4;
export const QUARTERS_PER_JOURNEY = YEARS_PER_JOURNEY * QUARTERS_PER_YEAR;

/** Provisional strategic directions. Starting points to edit, not promised outcomes. */
export const DEFAULT_YEAR_DIRECTIONS: { theme: string; direction: string }[] = [
  {
    theme: "Foundations",
    direction: "Build sales competence, improve communication, validate and sell software products.",
  },
  {
    theme: "Traction",
    direction: "Improve sales performance, grow product revenue, develop consistent content publishing.",
  },
  {
    theme: "Recognition",
    direction:
      "Build a recognizable personal brand, establish customer acquisition systems and test paid workshops.",
  },
  {
    theme: "Systems",
    direction: "Develop courses, expand software revenue and establish repeatable business operations.",
  },
  {
    theme: "Scale and independence",
    direction: "Scale educational and software businesses, build a team and evaluate employment independence.",
  },
];

export const DELIVERABLE_STATUSES = ["planned", "in_progress", "delivered", "dropped"] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];
export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  delivered: "Delivered",
  dropped: "Dropped",
};

export const RISK_STATUSES = ["open", "mitigated", "occurred", "closed"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];
export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  open: "Open",
  mitigated: "Mitigated",
  occurred: "Occurred",
  closed: "Closed",
};

export const DEPENDENCY_STATUSES = ["open", "resolved"] as const;
export type DependencyStatus = (typeof DEPENDENCY_STATUSES)[number];

export const KPI_DIRECTIONS = ["up", "down"] as const;
export type KpiDirection = (typeof KPI_DIRECTIONS)[number];

export type Period = { startDate: IsoDate; endDate: IsoDate };
export type YearPeriod = Period & { yearNumber: number };
export type QuarterPeriod = Period & {
  quarterNumber: number; // 1…20 across the journey
  yearNumber: number; // 1…5
  quarterOfYear: number; // 1…4
  midReviewOn: IsoDate;
  reviewOn: IsoDate;
};

/** Years and quarters are relative to the journey start, so "Q1" is the first three months of the journey. */
export function buildRoadmapPeriods(journeyStart: IsoDate): { years: YearPeriod[]; quarters: QuarterPeriod[] } {
  const years: YearPeriod[] = [];
  const quarters: QuarterPeriod[] = [];
  for (let y = 0; y < YEARS_PER_JOURNEY; y++) {
    const yearStart = addYears(journeyStart, y);
    years.push({ yearNumber: y + 1, startDate: yearStart, endDate: addDays(addYears(journeyStart, y + 1), -1) });
    for (let q = 0; q < QUARTERS_PER_YEAR; q++) {
      const startDate = addMonths(yearStart, q * 3);
      const endDate = addDays(addMonths(yearStart, (q + 1) * 3), -1);
      quarters.push({
        quarterNumber: y * QUARTERS_PER_YEAR + q + 1,
        yearNumber: y + 1,
        quarterOfYear: q + 1,
        startDate,
        endDate,
        midReviewOn: addDays(startDate, 6 * 7 - 1),
        reviewOn: endDate,
      });
    }
  }
  return { years, quarters };
}

export function quarterLabel(q: { yearNumber: number; quarterOfYear: number; quarterNumber: number }): string {
  return `Y${q.yearNumber} Q${q.quarterOfYear}`;
}

export type PeriodState = "past" | "current" | "future";

export function periodState(period: Period, today: IsoDate): PeriodState {
  if (today < period.startDate) return "future";
  if (today > period.endDate) return "past";
  return "current";
}

/** Whole weeks of available time in a period. */
export function weeksIn(period: Period): number {
  return Math.round(((diffDays(period.startDate, period.endDate) + 1) / 7) * 10) / 10;
}

export function capacityHours(hoursPerWeek: number, period: Period): number {
  return Math.round(hoursPerWeek * weeksIn(period));
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

/** 0–100. For "down" KPIs (e.g. churn, cost per lead) hitting or beating the target scores 100. */
export function kpiAttainment(kpi: { direction: KpiDirection; targetValue: number; actualValue: number | null }): number | null {
  if (kpi.actualValue === null) return null;
  if (kpi.direction === "up") {
    if (kpi.targetValue <= 0) return kpi.actualValue >= kpi.targetValue ? 100 : 0;
    return Math.round(Math.min(1, Math.max(0, kpi.actualValue / kpi.targetValue)) * 1000) / 10;
  }
  if (kpi.actualValue <= kpi.targetValue) return 100;
  if (kpi.actualValue <= 0) return 100;
  return Math.round(Math.min(1, Math.max(0, kpi.targetValue / kpi.actualValue)) * 1000) / 10;
}

export function kpiUnitOk(unit: string): unit is MeasureUnit {
  return ["number", "count", "currency", "percent", "hours", "boolean"].includes(unit);
}

// ---------------------------------------------------------------------------
// Planned versus actual
// ---------------------------------------------------------------------------

export type QuarterActuals = {
  objectives: number;
  objectivesAchieved: number;
  /** Mean outcome completion of the quarter's objectives (0–100), or null without objectives. */
  objectiveCompletion: number | null;
  deliverablesPlanned: number; // excludes dropped
  deliverablesDelivered: number;
  kpiAttainment: number | null;
  openRisks: number;
  openDependencies: number;
};

export function summarizeQuarter(input: {
  objectives: { completionPct: number; status: string }[];
  deliverables: { status: DeliverableStatus }[];
  kpis: { direction: KpiDirection; targetValue: number; actualValue: number | null }[];
  risks: { status: RiskStatus }[];
  dependencies: { status: DependencyStatus }[];
}): QuarterActuals {
  const counted = input.deliverables.filter((d) => d.status !== "dropped");
  const kpiScores = input.kpis.map(kpiAttainment).filter((v): v is number => v !== null);
  return {
    objectives: input.objectives.length,
    objectivesAchieved: input.objectives.filter((o) => o.status === "achieved").length,
    objectiveCompletion:
      input.objectives.length === 0
        ? null
        : Math.round((input.objectives.reduce((s, o) => s + o.completionPct, 0) / input.objectives.length) * 10) / 10,
    deliverablesPlanned: counted.length,
    deliverablesDelivered: counted.filter((d) => d.status === "delivered").length,
    kpiAttainment: kpiScores.length ? Math.round((kpiScores.reduce((a, b) => a + b, 0) / kpiScores.length) * 10) / 10 : null,
    openRisks: input.risks.filter((r) => r.status === "open" || r.status === "occurred").length,
    openDependencies: input.dependencies.filter((d) => d.status === "open").length,
  };
}

// ---------------------------------------------------------------------------
// Realism check
// ---------------------------------------------------------------------------

export type PlanWarning = { level: "info" | "warning"; code: string; message: string };

export type QuarterHistory = {
  quarters: number; // reviewed or past quarters considered
  deliverablesPlanned: number;
  deliverablesDelivered: number;
  objectiveCompletion: number | null; // average across those quarters
};

export type QuarterPlanAssessment = {
  plannedHours: number;
  capacityHours: number | null;
  loadPct: number | null;
  deliveryRate: number | null; // history, 0–100
  warnings: PlanWarning[];
};

/**
 * Checks a quarterly plan against the owner's available time and previous
 * performance. Planned effort per objective is the larger of its own estimate
 * and the sum of its deliverables' estimates (a partial breakdown never hides
 * the whole), plus deliverables not tied to an objective.
 */
export function assessQuarterPlan(input: {
  period: Period;
  hoursPerWeek: number | null;
  objectives: { id: string; title: string; estimatedHours: number | null; keyResultCount: number }[];
  deliverables: { goalId: string | null; estimatedHours: number | null; status: DeliverableStatus }[];
  history: QuarterHistory | null;
}): QuarterPlanAssessment {
  const warnings: PlanWarning[] = [];
  const live = input.deliverables.filter((d) => d.status !== "dropped");

  const objectiveIds = new Set(input.objectives.map((o) => o.id));
  const hoursByObjective = new Map<string, number>();
  let looseHours = 0;
  for (const d of live) {
    const h = d.estimatedHours ?? 0;
    if (d.goalId && objectiveIds.has(d.goalId)) hoursByObjective.set(d.goalId, (hoursByObjective.get(d.goalId) ?? 0) + h);
    else looseHours += h;
  }
  const objectiveHours = input.objectives.reduce(
    (s, o) => s + Math.max(o.estimatedHours ?? 0, hoursByObjective.get(o.id) ?? 0),
    0,
  );
  const plannedHours = Math.round(objectiveHours + looseHours);

  const capacity = input.hoursPerWeek && input.hoursPerWeek > 0 ? capacityHours(input.hoursPerWeek, input.period) : null;
  const loadPct = capacity ? Math.round((plannedHours / capacity) * 100) : null;

  const n = input.objectives.length;
  if (n === 0) {
    warnings.push({ level: "info", code: "no_objectives", message: "No objectives yet. Plan three to five major objectives." });
  } else if (n < 3) {
    warnings.push({ level: "info", code: "few_objectives", message: `${n} objective${n === 1 ? "" : "s"}. Three to five is the recommended range.` });
  } else if (n > 5) {
    warnings.push({
      level: "warning",
      code: "too_many_objectives",
      message: `${n} objectives. More than five usually spreads effort too thin. Pick the five that matter most.`,
    });
  }

  const withoutKrs = input.objectives.filter((o) => o.keyResultCount === 0);
  if (withoutKrs.length > 0) {
    warnings.push({
      level: "warning",
      code: "objectives_without_key_results",
      message: `No key results yet for: ${withoutKrs.map((o) => o.title).join(", ")}. Without them, progress can't be measured.`,
    });
  }

  if (capacity === null) {
    warnings.push({ level: "info", code: "no_capacity", message: "Set your available hours per week to check the plan against your time." });
  } else if (plannedHours === 0 && n > 0) {
    warnings.push({ level: "info", code: "no_estimates", message: "Add time estimates to objectives or deliverables to check the load." });
  } else if (loadPct !== null && loadPct > 100) {
    warnings.push({
      level: "warning",
      code: "over_capacity",
      message: `Planned effort is ${plannedHours} h against ${capacity} h available (${loadPct}%). Cut scope or extend dates.`,
    });
  } else if (loadPct !== null && loadPct > 85) {
    warnings.push({
      level: "info",
      code: "near_capacity",
      message: `Planned effort uses ${loadPct}% of your available time, which leaves little slack for surprises.`,
    });
  }

  let deliveryRate: number | null = null;
  const h = input.history;
  if (h && h.deliverablesPlanned > 0) {
    deliveryRate = Math.round((h.deliverablesDelivered / h.deliverablesPlanned) * 100);
    const perQuarterDelivered = h.deliverablesDelivered / Math.max(1, h.quarters);
    if (live.length > Math.ceil(perQuarterDelivered * 1.25) && live.length > 0) {
      warnings.push({
        level: "warning",
        code: "above_track_record",
        message: `You've delivered about ${Math.round(perQuarterDelivered * 10) / 10} deliverables per quarter (${deliveryRate}% of plan). ${live.length} planned is well above that.`,
      });
    }
  }
  if (h && h.objectiveCompletion !== null && h.objectiveCompletion < 50 && n > 3) {
    warnings.push({
      level: "warning",
      code: "low_past_completion",
      message: `Previous quarters reached ${h.objectiveCompletion}% average objective completion. Consider fewer objectives.`,
    });
  }

  return { plannedHours, capacityHours: capacity, loadPct, deliveryRate, warnings };
}
