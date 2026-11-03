/**
 * Roadmap service: 5 annual plans and 20 quarterly cycles, their objectives
 * (goals), key results (goals with is_key_result), deliverables, KPIs, risks,
 * dependencies and review dates, plus planned-versus-actual summaries.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import {
  goals,
  profiles,
  quarterDeliverables,
  quarterDependencies,
  quarterKpis,
  quarterRisks,
  roadmapQuarters,
  roadmapYears,
} from "@/db/schema";
import { decorateGoal, requireWorkspace, type GoalView } from "@/features/goals/server/service";
import { expectedPercent } from "@/lib/domain/goals";
import {
  DEFAULT_YEAR_DIRECTIONS,
  assessQuarterPlan,
  buildRoadmapPeriods,
  periodState,
  quarterLabel,
  summarizeQuarter,
  type DeliverableStatus,
  type DependencyStatus,
  type KpiDirection,
  type QuarterHistory,
  type RiskStatus,
} from "@/lib/domain/roadmap";
import { AppError, notFound } from "@/lib/errors";
import type {
  DeliverableCreateInput,
  DeliverableUpdateInput,
  KpiCreateInput,
  KpiUpdateInput,
  QuarterDependencyCreateInput,
  QuarterDependencyUpdateInput,
  QuarterUpdateInput,
  RiskCreateInput,
  RiskUpdateInput,
  RoadmapSettingsInput,
  YearUpdateInput,
} from "../schemas";

export type YearRow = typeof roadmapYears.$inferSelect;
export type QuarterRow = typeof roadmapQuarters.$inferSelect;
export type DeliverableRow = typeof quarterDeliverables.$inferSelect;
export type KpiRow = typeof quarterKpis.$inferSelect;
export type RiskRow = typeof quarterRisks.$inferSelect;
export type QuarterDependencyRow = typeof quarterDependencies.$inferSelect;

type QuarterArtefacts = {
  deliverables: DeliverableRow[];
  kpis: KpiRow[];
  risks: RiskRow[];
  dependencies: QuarterDependencyRow[];
};

const within = (date: string, p: { startDate: string; endDate: string }) => date >= p.startDate && date <= p.endDate;

// ---------------------------------------------------------------------------
// Generation and settings
// ---------------------------------------------------------------------------

/**
 * Creates the 5 annual plans and 20 quarters for the active journey. Idempotent:
 * existing years and quarters (and any edits to them) are kept. Only dates and
 * provisional directions are generated. No numeric targets are invented.
 */
export async function generateRoadmap(tx: Tx) {
  const ws = await requireWorkspace(tx);
  const { years, quarters } = buildRoadmapPeriods(ws.journey.startDate);
  const capacity = ws.profile?.weeklyCapacityHours ?? 15;

  await tx
    .insert(roadmapYears)
    .values(
      years.map((y, i) => ({
        journeyId: ws.journey.id,
        yearNumber: y.yearNumber,
        startDate: y.startDate,
        endDate: y.endDate,
        theme: DEFAULT_YEAR_DIRECTIONS[i].theme,
        direction: DEFAULT_YEAR_DIRECTIONS[i].direction,
        isProvisional: true,
      })),
    )
    .onConflictDoNothing({ target: [roadmapYears.journeyId, roadmapYears.yearNumber] });

  await tx
    .insert(roadmapQuarters)
    .values(
      quarters.map((q) => ({
        journeyId: ws.journey.id,
        yearNumber: q.yearNumber,
        quarterNumber: q.quarterNumber,
        startDate: q.startDate,
        endDate: q.endDate,
        capacityHoursPerWeek: capacity,
        midReviewOn: q.midReviewOn,
        reviewOn: q.reviewOn,
      })),
    )
    .onConflictDoNothing({ target: [roadmapQuarters.journeyId, roadmapQuarters.quarterNumber] });

  return getRoadmap(tx);
}

export async function updateRoadmapSettings(tx: Tx, input: RoadmapSettingsInput) {
  const ws = await requireWorkspace(tx);
  await tx.update(profiles).set({ weeklyCapacityHours: input.weeklyCapacityHours }).where(eq(profiles.id, sql`app.current_user_id()`));
  if (input.applyToFutureQuarters) {
    await tx
      .update(roadmapQuarters)
      .set({ capacityHoursPerWeek: input.weeklyCapacityHours })
      .where(and(eq(roadmapQuarters.journeyId, ws.journey.id), sql`${roadmapQuarters.endDate} >= ${ws.today}`));
  }
  return { weeklyCapacityHours: input.weeklyCapacityHours };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function loadArtefacts(tx: Tx, quarterIds: string[]): Promise<Map<string, QuarterArtefacts>> {
  const map = new Map<string, QuarterArtefacts>(quarterIds.map((id) => [id, { deliverables: [], kpis: [], risks: [], dependencies: [] }]));
  if (quarterIds.length === 0) return map;
  const deliverables = await tx
    .select()
    .from(quarterDeliverables)
    .where(inArray(quarterDeliverables.quarterId, quarterIds))
    .orderBy(asc(quarterDeliverables.sortOrder), asc(quarterDeliverables.dueOn), asc(quarterDeliverables.createdAt));
  const kpis = await tx
    .select()
    .from(quarterKpis)
    .where(inArray(quarterKpis.quarterId, quarterIds))
    .orderBy(asc(quarterKpis.sortOrder), asc(quarterKpis.createdAt));
  const risks = await tx
    .select()
    .from(quarterRisks)
    .where(inArray(quarterRisks.quarterId, quarterIds))
    .orderBy(sql`${quarterRisks.score} desc`, asc(quarterRisks.createdAt));
  const dependencies = await tx
    .select()
    .from(quarterDependencies)
    .where(inArray(quarterDependencies.quarterId, quarterIds))
    .orderBy(asc(quarterDependencies.neededBy), asc(quarterDependencies.createdAt));
  for (const d of deliverables) map.get(d.quarterId)!.deliverables.push(d);
  for (const k of kpis) map.get(k.quarterId)!.kpis.push(k);
  for (const r of risks) map.get(r.quarterId)!.risks.push(r);
  for (const d of dependencies) map.get(d.quarterId)!.dependencies.push(d);
  return map;
}

async function loadJourneyGoals(tx: Tx, journeyId: string) {
  return tx
    .select()
    .from(goals)
    .where(and(eq(goals.journeyId, journeyId), isNull(goals.archivedAt)))
    .orderBy(asc(goals.startDate), asc(goals.title));
}

function quarterPeriod(q: QuarterRow) {
  return { startDate: q.startDate, endDate: q.endDate };
}

/** Objectives of a quarter: quarterly-level goals (not key results) starting inside it. */
function objectivesOf(q: QuarterRow, allGoals: (typeof goals.$inferSelect)[]) {
  return allGoals.filter((g) => g.level === "quarterly" && !g.isKeyResult && within(g.startDate, quarterPeriod(q)));
}

function summarize(q: QuarterRow, objectives: { completionPct: number; status: string }[], a: QuarterArtefacts) {
  return summarizeQuarter({
    objectives,
    deliverables: a.deliverables.map((d) => ({ status: d.status as DeliverableStatus })),
    kpis: a.kpis.map((k) => ({ direction: k.direction as KpiDirection, targetValue: k.targetValue, actualValue: k.actualValue })),
    risks: a.risks.map((r) => ({ status: r.status as RiskStatus })),
    dependencies: a.dependencies.map((d) => ({ status: d.status as DependencyStatus })),
  });
}

export async function getRoadmap(tx: Tx) {
  const ws = await requireWorkspace(tx);
  const years = await tx
    .select()
    .from(roadmapYears)
    .where(eq(roadmapYears.journeyId, ws.journey.id))
    .orderBy(asc(roadmapYears.yearNumber));
  const quarters = await tx
    .select()
    .from(roadmapQuarters)
    .where(eq(roadmapQuarters.journeyId, ws.journey.id))
    .orderBy(asc(roadmapQuarters.quarterNumber));
  if (years.length === 0) return { generated: false as const, workspace: ws };

  const allGoals = await loadJourneyGoals(tx, ws.journey.id);
  const artefacts = await loadArtefacts(tx, quarters.map((q) => q.id));

  const quarterViews = quarters.map((q) => {
    const objectives = objectivesOf(q, allGoals);
    const actual = summarize(q, objectives, artefacts.get(q.id)!);
    const state = periodState(quarterPeriod(q), ws.today);
    return {
      ...q,
      label: quarterLabel({ yearNumber: q.yearNumber, quarterOfYear: ((q.quarterNumber - 1) % 4) + 1, quarterNumber: q.quarterNumber }),
      state,
      expectedPct: expectedPercent({ startDate: q.startDate, targetDate: q.endDate }, ws.today),
      actual,
      reviewDue: state === "past" && !q.reviewedAt,
    };
  });

  const yearViews = years.map((y) => {
    const annualObjectives = allGoals
      .filter((g) => g.level === "annual" && !g.isKeyResult && within(g.startDate, y))
      .map((g) => decorateGoal(g, ws.today));
    const yearQuarters = quarterViews.filter((q) => q.yearNumber === y.yearNumber);
    return {
      ...y,
      state: periodState(y, ws.today),
      expectedPct: expectedPercent({ startDate: y.startDate, targetDate: y.endDate }, ws.today),
      annualObjectives,
      annualCompletion: annualObjectives.length
        ? Math.round((annualObjectives.reduce((s, g) => s + g.completionPct, 0) / annualObjectives.length) * 10) / 10
        : null,
      quarters: yearQuarters,
    };
  });

  const current = quarterViews.find((q) => q.state === "current") ?? null;
  return {
    generated: true as const,
    workspace: ws,
    years: yearViews,
    currentQuarter: current,
    weeklyCapacityHours: ws.profile?.weeklyCapacityHours ?? 15,
    plannedVsActual: quarterViews.map((q) => ({
      quarterNumber: q.quarterNumber,
      label: q.label,
      state: q.state,
      planned: q.actual.deliverablesPlanned,
      delivered: q.actual.deliverablesDelivered,
      objectiveCompletion: q.actual.objectiveCompletion,
      expectedPct: q.expectedPct,
    })),
  };
}
export type Roadmap = Awaited<ReturnType<typeof getRoadmap>>;

async function findQuarter(tx: Tx, quarterNumber: number): Promise<QuarterRow & { journeyStart: string }> {
  const ws = await requireWorkspace(tx);
  const [q] = await tx
    .select()
    .from(roadmapQuarters)
    .where(and(eq(roadmapQuarters.journeyId, ws.journey.id), eq(roadmapQuarters.quarterNumber, quarterNumber)))
    .limit(1);
  if (!q) throw new AppError(404, "quarter_not_found", "That quarter does not exist. Generate the roadmap first.");
  return { ...q, journeyStart: ws.journey.startDate };
}

export type ObjectiveView = GoalView & { keyResults: GoalView[] };

export async function getQuarter(tx: Tx, quarterNumber: number) {
  const ws = await requireWorkspace(tx);
  const q = await findQuarter(tx, quarterNumber);
  const [year] = await tx
    .select()
    .from(roadmapYears)
    .where(and(eq(roadmapYears.journeyId, ws.journey.id), eq(roadmapYears.yearNumber, q.yearNumber)));
  const allGoals = await loadJourneyGoals(tx, ws.journey.id);
  const previous = await tx
    .select()
    .from(roadmapQuarters)
    .where(and(eq(roadmapQuarters.journeyId, ws.journey.id), sql`${roadmapQuarters.quarterNumber} < ${quarterNumber}`))
    .orderBy(asc(roadmapQuarters.quarterNumber));
  const artefacts = await loadArtefacts(tx, [q.id, ...previous.map((p) => p.id)]);
  const mine = artefacts.get(q.id)!;

  const objectives: ObjectiveView[] = objectivesOf(q, allGoals).map((o) => ({
    ...decorateGoal(o, ws.today),
    keyResults: allGoals.filter((g) => g.parentId === o.id && g.isKeyResult).map((g) => decorateGoal(g, ws.today)),
  }));

  // Track record: quarters that are over or have been reviewed.
  const done = previous.filter((p) => p.reviewedAt || p.endDate < ws.today);
  let history: QuarterHistory | null = null;
  if (done.length > 0) {
    const summaries = done.map((p) => summarize(p, objectivesOf(p, allGoals), artefacts.get(p.id)!));
    const withObjectives = summaries.filter((s) => s.objectiveCompletion !== null);
    history = {
      quarters: done.length,
      deliverablesPlanned: summaries.reduce((s, x) => s + x.deliverablesPlanned, 0),
      deliverablesDelivered: summaries.reduce((s, x) => s + x.deliverablesDelivered, 0),
      objectiveCompletion: withObjectives.length
        ? Math.round((withObjectives.reduce((s, x) => s + (x.objectiveCompletion ?? 0), 0) / withObjectives.length) * 10) / 10
        : null,
    };
  }

  const assessment = assessQuarterPlan({
    period: quarterPeriod(q),
    hoursPerWeek: q.capacityHoursPerWeek,
    objectives: objectives.map((o) => ({ id: o.id, title: o.title, estimatedHours: o.estimatedHours, keyResultCount: o.keyResults.length })),
    deliverables: mine.deliverables.map((d) => ({ goalId: d.goalId, estimatedHours: d.estimatedHours, status: d.status as DeliverableStatus })),
    history,
  });

  const goalTitles = new Map(allGoals.map((g) => [g.id, g.title]));
  const objectiveIds = new Set(objectives.map((o) => o.id));

  return {
    workspace: ws,
    quarter: {
      ...q,
      label: quarterLabel({ yearNumber: q.yearNumber, quarterOfYear: ((q.quarterNumber - 1) % 4) + 1, quarterNumber: q.quarterNumber }),
      state: periodState(quarterPeriod(q), ws.today),
      expectedPct: expectedPercent({ startDate: q.startDate, targetDate: q.endDate }, ws.today),
    },
    year: year ?? null,
    objectives,
    deliverables: mine.deliverables.map((d) => ({ ...d, goalTitle: d.goalId ? (goalTitles.get(d.goalId) ?? null) : null })),
    kpis: mine.kpis,
    risks: mine.risks,
    dependencies: mine.dependencies.map((d) => ({ ...d, goalTitle: d.dependsOnGoalId ? (goalTitles.get(d.dependsOnGoalId) ?? null) : null })),
    actual: summarize(q, objectives, mine),
    assessment,
    history,
    /** Parents for new quarterly objectives: annual objectives covering the quarter. */
    annualObjectives: allGoals
      .filter((g) => g.level === "annual" && !g.isKeyResult && g.startDate <= q.startDate && g.targetDate >= q.startDate)
      .map((g) => ({ id: g.id, title: g.title })),
    /** Goals a deliverable or dependency can point at. */
    goalOptions: allGoals
      .filter((g) => objectiveIds.has(g.id) || g.isKeyResult || g.level === "annual" || g.level === "five_year")
      .map((g) => ({ id: g.id, title: g.title, level: g.level, isKeyResult: g.isKeyResult })),
  };
}
export type QuarterDetail = Awaited<ReturnType<typeof getQuarter>>;

// ---------------------------------------------------------------------------
// Years and quarters
// ---------------------------------------------------------------------------

export async function updateYear(tx: Tx, yearNumber: number, patch: YearUpdateInput): Promise<YearRow> {
  const ws = await requireWorkspace(tx);
  const [row] = await tx
    .update(roadmapYears)
    .set(patch)
    .where(and(eq(roadmapYears.journeyId, ws.journey.id), eq(roadmapYears.yearNumber, yearNumber)))
    .returning();
  if (!row) throw notFound("Year plan");
  return row;
}

export async function updateQuarter(tx: Tx, quarterNumber: number, patch: QuarterUpdateInput): Promise<QuarterRow> {
  const q = await findQuarter(tx, quarterNumber);
  const { reviewed, ...rest } = patch;
  const set: Partial<typeof roadmapQuarters.$inferInsert> = { ...rest };
  if (reviewed !== undefined) set.reviewedAt = reviewed ? (q.reviewedAt ?? new Date()) : null;
  const [row] = await tx.update(roadmapQuarters).set(set).where(eq(roadmapQuarters.id, q.id)).returning();
  return row;
}

// ---------------------------------------------------------------------------
// Quarter artefacts
// ---------------------------------------------------------------------------

async function assertGoal(tx: Tx, goalId: string | null | undefined) {
  if (!goalId) return;
  const [g] = await tx.select({ id: goals.id }).from(goals).where(eq(goals.id, goalId)).limit(1);
  if (!g) throw notFound("Goal");
}

export async function addDeliverable(tx: Tx, quarterNumber: number, input: DeliverableCreateInput) {
  const q = await findQuarter(tx, quarterNumber);
  await assertGoal(tx, input.goalId);
  const [row] = await tx.insert(quarterDeliverables).values({ ...input, quarterId: q.id }).returning();
  return row;
}

export async function updateDeliverable(tx: Tx, id: string, patch: DeliverableUpdateInput) {
  await assertGoal(tx, patch.goalId);
  const [row] = await tx.update(quarterDeliverables).set(patch).where(eq(quarterDeliverables.id, id)).returning();
  if (!row) throw notFound("Deliverable");
  return row;
}

export async function deleteDeliverable(tx: Tx, id: string) {
  const rows = await tx.delete(quarterDeliverables).where(eq(quarterDeliverables.id, id)).returning({ id: quarterDeliverables.id });
  if (rows.length === 0) throw notFound("Deliverable");
}

export async function addKpi(tx: Tx, quarterNumber: number, input: KpiCreateInput) {
  const q = await findQuarter(tx, quarterNumber);
  const [row] = await tx
    .insert(quarterKpis)
    .values({ ...input, currency: input.unit === "currency" ? input.currency : null, quarterId: q.id })
    .returning();
  return row;
}

export async function updateKpi(tx: Tx, id: string, patch: KpiUpdateInput) {
  const set = { ...patch };
  if (patch.unit && patch.unit !== "currency") set.currency = null;
  const [row] = await tx.update(quarterKpis).set(set).where(eq(quarterKpis.id, id)).returning();
  if (!row) throw notFound("KPI");
  return row;
}

export async function deleteKpi(tx: Tx, id: string) {
  const rows = await tx.delete(quarterKpis).where(eq(quarterKpis.id, id)).returning({ id: quarterKpis.id });
  if (rows.length === 0) throw notFound("KPI");
}

export async function addRisk(tx: Tx, quarterNumber: number, input: RiskCreateInput) {
  const q = await findQuarter(tx, quarterNumber);
  const [row] = await tx.insert(quarterRisks).values({ ...input, quarterId: q.id }).returning();
  return row;
}

export async function updateRisk(tx: Tx, id: string, patch: RiskUpdateInput) {
  const [row] = await tx.update(quarterRisks).set(patch).where(eq(quarterRisks.id, id)).returning();
  if (!row) throw notFound("Risk");
  return row;
}

export async function deleteRisk(tx: Tx, id: string) {
  const rows = await tx.delete(quarterRisks).where(eq(quarterRisks.id, id)).returning({ id: quarterRisks.id });
  if (rows.length === 0) throw notFound("Risk");
}

export async function addQuarterDependency(tx: Tx, quarterNumber: number, input: QuarterDependencyCreateInput) {
  const q = await findQuarter(tx, quarterNumber);
  await assertGoal(tx, input.dependsOnGoalId);
  const [row] = await tx.insert(quarterDependencies).values({ ...input, quarterId: q.id }).returning();
  return row;
}

export async function updateQuarterDependency(tx: Tx, id: string, patch: QuarterDependencyUpdateInput) {
  await assertGoal(tx, patch.dependsOnGoalId);
  const [row] = await tx.update(quarterDependencies).set(patch).where(eq(quarterDependencies.id, id)).returning();
  if (!row) throw notFound("Dependency");
  return row;
}

export async function deleteQuarterDependency(tx: Tx, id: string) {
  const rows = await tx.delete(quarterDependencies).where(eq(quarterDependencies.id, id)).returning({ id: quarterDependencies.id });
  if (rows.length === 0) throw notFound("Dependency");
}
