/**
 * Weekly goal management: weekly goals (linked to monthly, quarterly or
 * annual objectives), their tasks, unfinished work, carry-forward, and an
 * outcome-based scorecard.
 */
import { and, asc, eq, gte, inArray, isNull, lt, lte, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import { goals, tasks, weekPlans } from "@/db/schema";
import { createGoal, decorateGoal, requireWorkspace, type GoalView } from "@/features/goals/server/service";
import { goalCreateSchema } from "@/features/goals/schemas";
import {
  FOCUS_AREAS,
  FOCUS_AREA_PILLAR,
  WEEKLY_PARENT_LEVELS,
  isWeekStart,
  shiftWeek,
  weekOf,
  weeklyGoalPeriod,
  weeklyScorecard,
  type FocusArea,
  type ScorecardTask,
  type Week,
} from "@/lib/domain/weekly";
import { AppError, notFound } from "@/lib/errors";
import type { WeekPlanInput, WeekReviewInput, WeeklyGoalCreateInput } from "../schemas";

export type TaskRow = typeof tasks.$inferSelect;
export type WeekPlanRow = typeof weekPlans.$inferSelect;
export type WeeklyGoalView = GoalView & { tasks: TaskRow[]; parentTitle: string | null; parentLevel: string | null };

async function resolveWeek(tx: Tx, weekStart?: string) {
  const ws = await requireWorkspace(tx);
  const week: Week = weekStart ? weekOf(weekStart, ws.weekStartsOn) : weekOf(ws.today, ws.weekStartsOn);
  if (weekStart && !isWeekStart(weekStart, ws.weekStartsOn)) {
    throw new AppError(400, "not_a_week_start", `Weeks start on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][ws.weekStartsOn]}.`);
  }
  return { ws, week };
}

const OPEN = ["todo", "doing"] as const;

function toScorecardTask(t: TaskRow, areaByGoal: Map<string, FocusArea | null>): ScorecardTask {
  return {
    status: t.status,
    isDeliverable: t.isDeliverable,
    estimatedMinutes: t.estimatedMinutes,
    actualMinutes: t.actualMinutes,
    carryCount: t.carryCount,
    area: t.goalId ? (areaByGoal.get(t.goalId) ?? null) : null,
  };
}

export async function getWeek(tx: Tx, weekStart?: string) {
  const { ws, week } = await resolveWeek(tx, weekStart);

  const [plan] = await tx.select().from(weekPlans).where(eq(weekPlans.weekStart, week.weekStart)).limit(1);

  // Weekly goals that start in this week.
  const goalRows = await tx
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.journeyId, ws.journey.id),
        eq(goals.level, "weekly"),
        eq(goals.isKeyResult, false),
        isNull(goals.archivedAt),
        gte(goals.startDate, week.weekStart),
        lte(goals.startDate, week.weekEnd),
      ),
    )
    .orderBy(asc(goals.priority), asc(goals.title));

  // Tasks planned for this week (including ones carried in).
  const weekTasks = await tx
    .select()
    .from(tasks)
    .where(and(isNull(tasks.archivedAt), eq(tasks.plannedWeek, week.weekStart)))
    .orderBy(asc(tasks.status), asc(tasks.priority), asc(tasks.dueOn), asc(tasks.createdAt));

  // Unfinished work from earlier weeks.
  const unfinished = await tx
    .select()
    .from(tasks)
    .where(and(isNull(tasks.archivedAt), lt(tasks.plannedWeek, week.weekStart), inArray(tasks.status, [...OPEN])))
    .orderBy(asc(tasks.plannedWeek), asc(tasks.priority));

  // Objectives a weekly goal can link to: annual, quarterly or monthly goals covering the week.
  const parents = await tx
    .select({ id: goals.id, title: goals.title, level: goals.level, isKeyResult: goals.isKeyResult, pillarId: goals.pillarId, startDate: goals.startDate, targetDate: goals.targetDate })
    .from(goals)
    .where(
      and(
        eq(goals.journeyId, ws.journey.id),
        isNull(goals.archivedAt),
        inArray(goals.level, [...WEEKLY_PARENT_LEVELS]),
        lte(goals.startDate, week.weekEnd),
        gte(goals.targetDate, week.weekStart),
        notInArray(goals.status, ["achieved", "missed", "abandoned"]),
      ),
    )
    .orderBy(sql`app.goal_level_rank(${goals.level}) desc`, asc(goals.title));

  const titleOf = new Map<string, { title: string; level: string }>();
  const linkedIds = Array.from(new Set([...goalRows.map((g) => g.parentId), ...weekTasks.map((t) => t.goalId), ...unfinished.map((t) => t.goalId)].filter(Boolean))) as string[];
  if (linkedIds.length) {
    const rows = await tx.select({ id: goals.id, title: goals.title, level: goals.level }).from(goals).where(inArray(goals.id, linkedIds));
    for (const r of rows) titleOf.set(r.id, { title: r.title, level: r.level });
  }
  for (const g of goalRows) titleOf.set(g.id, { title: g.title, level: g.level });

  const weeklyGoals: WeeklyGoalView[] = goalRows.map((g) => ({
    ...decorateGoal(g, ws.today),
    tasks: weekTasks.filter((t) => t.goalId === g.id),
    parentTitle: g.parentId ? (titleOf.get(g.parentId)?.title ?? null) : null,
    parentLevel: g.parentId ? (titleOf.get(g.parentId)?.level ?? null) : null,
  }));
  const weeklyGoalIds = new Set(goalRows.map((g) => g.id));
  const otherTasks = weekTasks.filter((t) => !t.goalId || !weeklyGoalIds.has(t.goalId));

  const areaByGoal = new Map<string, FocusArea | null>(goalRows.map((g) => [g.id, (g.focusArea as FocusArea | null) ?? null]));
  const capacityHours = plan?.capacityHours ?? ws.profile?.weeklyCapacityHours ?? null;
  const scorecard = weeklyScorecard({
    goals: goalRows.map((g) => ({ area: (g.focusArea as FocusArea | null) ?? null, completionPct: g.completionPct, status: g.status, isTargetMet: g.isTargetMet })),
    tasks: weekTasks.map((t) => toScorecardTask(t, areaByGoal)),
    capacityHours,
  });

  return {
    workspace: ws,
    week,
    previousWeek: shiftWeek(week.weekStart, -1),
    nextWeek: shiftWeek(week.weekStart, 1),
    isCurrentWeek: ws.today >= week.weekStart && ws.today <= week.weekEnd,
    plan: plan ?? null,
    capacityHours,
    weeklyGoals,
    goalsByArea: FOCUS_AREAS.map((area) => ({ area, goals: weeklyGoals.filter((g) => g.focusArea === area) })),
    otherTasks: otherTasks.map((t) => ({ ...t, goalTitle: t.goalId ? (titleOf.get(t.goalId)?.title ?? null) : null })),
    unfinished: unfinished.map((t) => ({ ...t, goalTitle: t.goalId ? (titleOf.get(t.goalId)?.title ?? null) : null })),
    parentOptions: parents,
    scorecard,
    frozenScorecard: (plan?.scorecard as ReturnType<typeof weeklyScorecard> | null) ?? null,
  };
}
export type WeekDetail = Awaited<ReturnType<typeof getWeek>>;

export async function saveWeekPlan(tx: Tx, weekStart: string, input: WeekPlanInput): Promise<WeekPlanRow> {
  const { week } = await resolveWeek(tx, weekStart);
  const [row] = await tx
    .insert(weekPlans)
    .values({ weekStart: week.weekStart, ...input })
    .onConflictDoUpdate({ target: [weekPlans.userId, weekPlans.weekStart], set: input })
    .returning();
  return row;
}

export async function createWeeklyGoal(tx: Tx, weekStart: string, input: WeeklyGoalCreateInput) {
  const { ws, week } = await resolveWeek(tx, weekStart);
  const [parent] = await tx.select().from(goals).where(eq(goals.id, input.parentId)).limit(1);
  if (!parent) throw notFound("Objective");
  if (!(WEEKLY_PARENT_LEVELS as readonly string[]).includes(parent.level)) {
    throw new AppError(422, "weekly_goal_needs_objective", "Link the weekly goal to a monthly, quarterly or annual objective.");
  }
  const period = weeklyGoalPeriod(week, parent);
  if (!period) throw new AppError(422, "outside_parent_period", "That objective does not cover this week.");
  const pillarId =
    input.pillarId ?? ws.pillars.find((p) => p.key === FOCUS_AREA_PILLAR[input.focusArea])?.id ?? parent.pillarId;

  return createGoal(
    tx,
    goalCreateSchema.parse({
      title: input.title,
      level: "weekly",
      parentId: parent.id,
      focusArea: input.focusArea,
      pillarId,
      startDate: period.startDate,
      targetDate: period.targetDate,
      successMetric: input.successMetric,
      unit: input.unit,
      currency: input.unit === "currency" ? ws.baseCurrency : null,
      measurementMode: input.measurementMode,
      baselineValue: input.baselineValue,
      targetValue: input.targetValue,
      priority: input.priority,
      estimatedHours: input.estimatedHours,
    }),
  );
}

async function findTask(tx: Tx, id: string): Promise<TaskRow> {
  const [t] = await tx.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!t) throw notFound("Task");
  return t;
}

/** Moves an unfinished task to another week (default: the week after its planned week). */
export async function carryForward(tx: Tx, taskId: string, opts: { toWeek?: string; goalId?: string | null } = {}) {
  const ws = await requireWorkspace(tx);
  const t = await findTask(tx, taskId);
  if (t.status === "done" || t.status === "cancelled") throw new AppError(422, "task_closed", "Only unfinished tasks can be carried forward.");
  const fromWeek = t.plannedWeek ?? weekOf(ws.today, ws.weekStartsOn).weekStart;
  const target = opts.toWeek ? weekOf(opts.toWeek, ws.weekStartsOn).weekStart : shiftWeek(fromWeek, 1);
  if (target <= fromWeek) throw new AppError(422, "carry_backwards", "Carry tasks forward to a later week.");
  const [row] = await tx
    .update(tasks)
    .set({
      plannedWeek: target,
      carriedFromWeek: fromWeek,
      carryCount: sql`${tasks.carryCount} + 1`,
      dueOn: t.dueOn && t.dueOn < target ? null : t.dueOn,
      ...(opts.goalId !== undefined ? { goalId: opts.goalId } : {}),
    })
    .where(eq(tasks.id, taskId))
    .returning();
  return row;
}

/** Carries every unfinished task planned before `toWeek` into it. */
export async function carryForwardAll(tx: Tx, toWeek: string) {
  const { week } = await resolveWeek(tx, toWeek);
  const open = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(isNull(tasks.archivedAt), lt(tasks.plannedWeek, week.weekStart), inArray(tasks.status, [...OPEN])));
  for (const t of open) await carryForward(tx, t.id, { toWeek: week.weekStart });
  return { carried: open.length };
}

/** Sets a new due date; the planned week follows it. Counts as a carry when it moves to a later week. */
export async function rescheduleTask(tx: Tx, taskId: string, dueOn: string) {
  const ws = await requireWorkspace(tx);
  const t = await findTask(tx, taskId);
  const newWeek = weekOf(dueOn, ws.weekStartsOn).weekStart;
  const later = t.plannedWeek !== null && newWeek > t.plannedWeek;
  const [row] = await tx
    .update(tasks)
    .set({
      dueOn,
      plannedWeek: newWeek,
      ...(later ? { carriedFromWeek: t.plannedWeek, carryCount: sql`${tasks.carryCount} + 1` } : {}),
    })
    .where(eq(tasks.id, taskId))
    .returning();
  return row;
}

/** Completes the weekly review and freezes the scorecard for history. */
export async function reviewWeek(tx: Tx, weekStart: string, input: WeekReviewInput) {
  const detail = await getWeek(tx, weekStart);
  const [row] = await tx
    .insert(weekPlans)
    .values({ weekStart: detail.week.weekStart, ...input, scorecard: detail.scorecard, reviewedAt: new Date() })
    .onConflictDoUpdate({
      target: [weekPlans.userId, weekPlans.weekStart],
      set: { ...input, scorecard: detail.scorecard, reviewedAt: new Date() },
    })
    .returning();
  return row;
}

/** Recent week scores for a trend line (live for unreviewed weeks, frozen for reviewed ones). */
export async function listRecentWeeks(tx: Tx, count = 8) {
  const ws = await requireWorkspace(tx);
  const current = weekOf(ws.today, ws.weekStartsOn).weekStart;
  const out: { weekStart: string; score: number | null; reviewed: boolean }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = shiftWeek(current, -i);
    if (start < weekOf(ws.journey.startDate, ws.weekStartsOn).weekStart) continue;
    const d = await getWeek(tx, start);
    out.push({ weekStart: start, score: (d.frozenScorecard ?? d.scorecard).score, reviewed: Boolean(d.plan?.reviewedAt) });
  }
  return out;
}

