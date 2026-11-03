/**
 * Today: the daily execution dashboard. Everything here is scoped to the
 * owner's local date (profile timezone).
 */
import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import { dayPlans, goals, habitCheckins, habits, tasks } from "@/db/schema";
import { decorateGoal, requireWorkspace } from "@/features/goals/server/service";
import { isIsoDate } from "@/lib/domain/dates";
import { dailyProgress, isScheduledOn, journeyDay } from "@/lib/domain/daily";
import { weekOf } from "@/lib/domain/weekly";
import { AppError, notFound } from "@/lib/errors";
import type { HabitCreateInput, QuickTaskInput, ReflectionInput } from "../schemas";

export type TaskRow = typeof tasks.$inferSelect;
const OPEN = ["todo", "doing"] as const;
const CLOSED_GOAL = ["achieved", "missed", "abandoned"] as ("achieved" | "missed" | "abandoned")[];

async function resolveDay(tx: Tx, day?: string) {
  const ws = await requireWorkspace(tx);
  if (day && !isIsoDate(day)) throw new AppError(400, "invalid_date", "Use a date like 2027-01-15.");
  return { ws, day: day ?? ws.today };
}

export async function getToday(tx: Tx, dayArg?: string) {
  const { ws, day } = await resolveDay(tx, dayArg);
  const week = weekOf(day, ws.weekStartsOn);

  const [plan] = await tx.select().from(dayPlans).where(eq(dayPlans.day, day)).limit(1);

  // Direction: current annual and quarterly objectives, and this week's priorities.
  const covering = (level: "annual" | "quarterly") =>
    tx
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.journeyId, ws.journey.id),
          eq(goals.level, level),
          eq(goals.isKeyResult, false),
          isNull(goals.archivedAt),
          lte(goals.startDate, day),
          gte(goals.targetDate, day),
          notInArray(goals.status, CLOSED_GOAL),
        ),
      )
      .orderBy(asc(goals.priority), asc(goals.title));
  const annual = await covering("annual");
  const quarterly = await covering("quarterly");
  const weekGoals = await tx
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

  // Today's tasks: scheduled today or picked as one of today's three most important.
  const todayTasks = await tx
    .select()
    .from(tasks)
    .where(and(isNull(tasks.archivedAt), or(eq(tasks.scheduledOn, day), eq(tasks.mitOn, day))))
    .orderBy(asc(tasks.mitRank), asc(tasks.scheduledStart), asc(tasks.priority), asc(tasks.createdAt));

  // Overdue: scheduled on an earlier day and still open.
  const overdue = await tx
    .select()
    .from(tasks)
    .where(and(isNull(tasks.archivedAt), lt(tasks.scheduledOn, day), inArray(tasks.status, [...OPEN])))
    .orderBy(asc(tasks.scheduledOn), asc(tasks.priority));

  // Candidates to pull into today: this week's open tasks not yet scheduled for a day.
  const candidates = await tx
    .select()
    .from(tasks)
    .where(
      and(
        isNull(tasks.archivedAt),
        inArray(tasks.status, [...OPEN]),
        eq(tasks.plannedWeek, week.weekStart),
        or(isNull(tasks.scheduledOn), ne(tasks.scheduledOn, day)),
        or(isNull(tasks.mitOn), ne(tasks.mitOn, day)),
      ),
    )
    .orderBy(asc(tasks.priority), asc(tasks.dueOn), asc(tasks.createdAt));

  const habitRows = await tx.select().from(habits).where(isNull(habits.archivedAt)).orderBy(asc(habits.sortOrder), asc(habits.name));
  const todaysHabits = habitRows.filter((h) => isScheduledOn(h.scheduleDays, day));
  const checkins = todaysHabits.length
    ? await tx
        .select()
        .from(habitCheckins)
        .where(and(eq(habitCheckins.checkinOn, day), inArray(habitCheckins.habitId, todaysHabits.map((h) => h.id))))
    : [];
  const statusOf = new Map(checkins.map((c) => [c.habitId, c.status]));

  const goalTitle = new Map(weekGoals.map((g) => [g.id, g.title]));
  const goalIds = Array.from(new Set([...todayTasks, ...overdue, ...candidates].map((t) => t.goalId).filter((id): id is string => !!id && !goalTitle.has(id))));
  if (goalIds.length) {
    for (const g of await tx.select({ id: goals.id, title: goals.title }).from(goals).where(inArray(goals.id, goalIds))) goalTitle.set(g.id, g.title);
  }
  const withGoal = (t: TaskRow) => ({ ...t, goalTitle: t.goalId ? (goalTitle.get(t.goalId) ?? null) : null });

  const mits = ([1, 2, 3] as const).map((rank) => {
    const t = todayTasks.find((x) => x.mitOn === day && x.mitRank === rank);
    return { rank, task: t ? withGoal(t) : null };
  });

  const habitsToday = todaysHabits.map((h) => ({ ...h, status: (statusOf.get(h.id) ?? null) as "done" | "skipped" | null }));
  const progress = dailyProgress({
    tasks: todayTasks.map((t) => ({ status: t.status, estimatedMinutes: t.estimatedMinutes, mitRank: t.mitOn === day ? t.mitRank : null })),
    habits: habitsToday.map((h) => ({ status: h.status })),
  });
  const openMinutes = todayTasks.filter((t) => t.status === "todo" || t.status === "doing").reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);

  return {
    workspace: ws,
    day,
    isToday: day === ws.today,
    week,
    journey: journeyDay(ws.journey, day),
    annualObjectives: annual.map((g) => decorateGoal(g, day)),
    quarterlyObjectives: quarterly.map((g) => decorateGoal(g, day)),
    weekPriorities: weekGoals.map((g) => decorateGoal(g, day)),
    mits,
    tasks: todayTasks.map(withGoal),
    scheduled: todayTasks.filter((t) => t.scheduledStart).map(withGoal),
    overdue: overdue.map(withGoal),
    candidates: candidates.map(withGoal),
    habits: habitsToday,
    plan: plan ?? null,
    availableMinutes: plan?.availableMinutes ?? null,
    plannedMinutes: todayTasks.filter((t) => t.status !== "cancelled").reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0),
    openMinutes,
    progress,
  };
}
export type TodayDetail = Awaited<ReturnType<typeof getToday>>;

async function findTask(tx: Tx, id: string): Promise<TaskRow> {
  const [t] = await tx.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!t) throw notFound("Task");
  return t;
}

/** Schedules a task for a day; moving it into a later week counts as a carry-forward. */
async function scheduleOn(tx: Tx, task: TaskRow, day: string, weekStartsOn: number) {
  const targetWeek = weekOf(day, weekStartsOn).weekStart;
  const laterWeek = task.plannedWeek !== null && targetWeek > task.plannedWeek;
  await tx
    .update(tasks)
    .set({
      scheduledOn: day,
      plannedWeek: targetWeek,
      ...(laterWeek ? { carriedFromWeek: task.plannedWeek, carryCount: sql`${tasks.carryCount} + 1` } : {}),
    })
    .where(eq(tasks.id, task.id));
}

export async function addTodayTask(tx: Tx, input: QuickTaskInput, dayArg?: string) {
  const { ws, day } = await resolveDay(tx, dayArg);
  if (input.goalId) {
    const [g] = await tx.select({ id: goals.id }).from(goals).where(eq(goals.id, input.goalId)).limit(1);
    if (!g) throw notFound("Goal");
  }
  if (input.mitRank) await clearMit(tx, day, input.mitRank);
  const [row] = await tx
    .insert(tasks)
    .values({
      title: input.title,
      goalId: input.goalId,
      estimatedMinutes: input.estimatedMinutes,
      scheduledStart: input.scheduledStart,
      isDeliverable: input.isDeliverable,
      scheduledOn: day,
      plannedWeek: weekOf(day, ws.weekStartsOn).weekStart,
      mitOn: input.mitRank ? day : null,
      mitRank: input.mitRank,
    })
    .returning();
  return row;
}

async function clearMit(tx: Tx, day: string, rank: number) {
  await tx.update(tasks).set({ mitOn: null, mitRank: null }).where(and(eq(tasks.mitOn, day), eq(tasks.mitRank, rank)));
}

/** Puts a task into one of today's three most-important slots (or empties the slot). */
export async function setMit(tx: Tx, rank: number, taskId: string | null, dayArg?: string) {
  const { ws, day } = await resolveDay(tx, dayArg);
  await clearMit(tx, day, rank);
  if (!taskId) return null;
  const t = await findTask(tx, taskId);
  if (t.status === "cancelled") throw new AppError(422, "task_closed", "A cancelled task can't be today's mission.");
  if (t.scheduledOn !== day) await scheduleOn(tx, t, day, ws.weekStartsOn);
  const [row] = await tx.update(tasks).set({ mitOn: day, mitRank: rank }).where(eq(tasks.id, taskId)).returning();
  return row;
}

export async function scheduleForToday(tx: Tx, taskId: string, dayArg?: string) {
  const { ws, day } = await resolveDay(tx, dayArg);
  const t = await findTask(tx, taskId);
  await scheduleOn(tx, t, day, ws.weekStartsOn);
  return findTask(tx, taskId);
}

export async function carryOverdueToToday(tx: Tx, dayArg?: string) {
  const { ws, day } = await resolveDay(tx, dayArg);
  const open = await tx
    .select()
    .from(tasks)
    .where(and(isNull(tasks.archivedAt), lt(tasks.scheduledOn, day), inArray(tasks.status, [...OPEN])));
  for (const t of open) await scheduleOn(tx, t, day, ws.weekStartsOn);
  return { carried: open.length };
}

export async function unscheduleTask(tx: Tx, taskId: string) {
  const [row] = await tx.update(tasks).set({ scheduledOn: null, scheduledStart: null, mitOn: null, mitRank: null }).where(eq(tasks.id, taskId)).returning();
  if (!row) throw notFound("Task");
  return row;
}

/** Start the clock on a task. */
export async function startTask(tx: Tx, taskId: string) {
  const t = await findTask(tx, taskId);
  if (t.status === "done" || t.status === "cancelled") throw new AppError(422, "task_closed", "That task is already closed.");
  const [row] = await tx
    .update(tasks)
    .set({ status: "doing", startedAt: t.startedAt ?? new Date(), finishedAt: null })
    .where(eq(tasks.id, taskId))
    .returning();
  return row;
}

/** Finish a task: stamps the finish time; actual duration = elapsed since start unless logged manually. */
export async function finishTask(tx: Tx, taskId: string) {
  await findTask(tx, taskId);
  const [row] = await tx.update(tasks).set({ status: "done", finishedAt: new Date() }).where(eq(tasks.id, taskId)).returning();
  return row;
}

export async function saveDayPlan(tx: Tx, availableMinutes: number | null, dayArg?: string) {
  const { day } = await resolveDay(tx, dayArg);
  const [row] = await tx
    .insert(dayPlans)
    .values({ day, availableMinutes })
    .onConflictDoUpdate({ target: [dayPlans.userId, dayPlans.day], set: { availableMinutes } })
    .returning();
  return row;
}

export async function saveReflection(tx: Tx, input: ReflectionInput, dayArg?: string) {
  const { day } = await resolveDay(tx, dayArg);
  const reflectedAt = Object.values(input).some(Boolean) ? new Date() : null;
  const [row] = await tx
    .insert(dayPlans)
    .values({ day, ...input, reflectedAt })
    .onConflictDoUpdate({ target: [dayPlans.userId, dayPlans.day], set: { ...input, reflectedAt } })
    .returning();
  return row;
}

export async function createHabit(tx: Tx, input: HabitCreateInput) {
  const [row] = await tx.insert(habits).values(input).returning();
  return row;
}

/** Set (or clear with null) a habit's check-in for a day. */
export async function checkInHabit(tx: Tx, habitId: string, status: "done" | "skipped" | null, dayArg?: string, note: string | null = null) {
  const { day } = await resolveDay(tx, dayArg);
  const [h] = await tx.select({ id: habits.id }).from(habits).where(eq(habits.id, habitId)).limit(1);
  if (!h) throw notFound("Habit");
  if (status === null) {
    await tx.delete(habitCheckins).where(and(eq(habitCheckins.habitId, habitId), eq(habitCheckins.checkinOn, day)));
    return null;
  }
  const [row] = await tx
    .insert(habitCheckins)
    .values({ habitId, checkinOn: day, status, note })
    .onConflictDoUpdate({ target: [habitCheckins.habitId, habitCheckins.checkinOn], set: { status, note } })
    .returning();
  return row;
}
