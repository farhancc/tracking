/**
 * Habit tracker service: habits with flexible schedules, check-ins, rest
 * days, consistency, streaks, missed-habit analysis, trends and correlation
 * with daily priorities.
 */
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { lockForUser, type Tx } from "@/db/drizzle";
import { habitCheckins, habits, restDays, tasks } from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import { addDays, addMonths, startOfWeek, type IsoDate } from "@/lib/domain/dates";
import {
  consistency,
  DEFAULT_HABITS,
  dayState,
  missedAnalysis,
  priorityCorrelation,
  streaks,
  weeklyTrend,
  type CheckinStatus,
  type HabitContext,
  type HabitDef,
} from "@/lib/domain/habits";
import { AppError, notFound } from "@/lib/errors";
import type { HabitCreateInput, HabitUpdateInput } from "../schemas";

export type HabitRow = typeof habits.$inferSelect;

/** First visit with no habits at all: the nine habits from the plan (all editable). */
export async function ensureDefaultHabits(tx: Tx) {
  const ws = await requireWorkspace(tx);
  // Habit names aren't unique, so concurrent first visits would each add the nine habits; serialise them.
  await lockForUser(tx, "default-habits");
  const [{ n }] = await tx.select({ n: count() }).from(habits);
  if (n > 0) return false;
  await tx.insert(habits).values(DEFAULT_HABITS.map((h, i) => ({ ...h, sortOrder: i, startedOn: ws.today })));
  return true;
}

/** Adds any suggested habit whose name you don't have yet. */
export async function addSuggestedHabits(tx: Tx) {
  const ws = await requireWorkspace(tx);
  const existing = new Set((await tx.select({ name: habits.name }).from(habits).where(isNull(habits.archivedAt))).map((h) => h.name.toLowerCase()));
  const missing = DEFAULT_HABITS.filter((h) => !existing.has(h.name.toLowerCase()));
  if (missing.length) await tx.insert(habits).values(missing.map((h, i) => ({ ...h, sortOrder: 100 + i, startedOn: ws.today })));
  return missing.length;
}

async function findHabit(tx: Tx, id: string): Promise<HabitRow> {
  const [h] = await tx.select().from(habits).where(eq(habits.id, id)).limit(1);
  if (!h) throw notFound("Habit");
  return h;
}

export async function createHabit(tx: Tx, input: HabitCreateInput) {
  const ws = await requireWorkspace(tx);
  const [row] = await tx.insert(habits).values({ ...input, startedOn: input.startedOn ?? ws.today }).returning();
  return row;
}

export async function updateHabit(tx: Tx, id: string, patch: HabitUpdateInput) {
  const current = await findHabit(tx, id);
  const { archived, ...rest } = patch;
  const kind = rest.scheduleKind ?? current.scheduleKind;
  const set = { ...rest, weeklyTarget: kind === "weekly" ? (rest.weeklyTarget ?? current.weeklyTarget) : null };
  if (kind === "weekly" && !set.weeklyTarget) throw new AppError(422, "validation_failed", "How many times a week?", { weeklyTarget: ["Pick 1–7."] });
  const [row] = await tx
    .update(habits)
    .set({ ...set, ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) })
    .where(eq(habits.id, id))
    .returning();
  return row;
}

/** Permanently deletes a habit and its check-in history (callers must confirm). */
export async function deleteHabit(tx: Tx, id: string) {
  const h = await findHabit(tx, id);
  const [{ n }] = await tx.select({ n: count() }).from(habitCheckins).where(eq(habitCheckins.habitId, id));
  await tx.delete(habits).where(eq(habits.id, id));
  return { deleted: h.name, checkinsDeleted: n };
}

export async function checkIn(tx: Tx, habitId: string, input: { day?: string; status: CheckinStatus | null; note: string | null }) {
  const ws = await requireWorkspace(tx);
  await findHabit(tx, habitId);
  const day = input.day ?? ws.today;
  if (input.status === null) {
    await tx.delete(habitCheckins).where(and(eq(habitCheckins.habitId, habitId), eq(habitCheckins.checkinOn, day)));
    return null;
  }
  const [row] = await tx
    .insert(habitCheckins)
    .values({ habitId, checkinOn: day, status: input.status, note: input.note })
    .onConflictDoUpdate({ target: [habitCheckins.habitId, habitCheckins.checkinOn], set: { status: input.status, note: input.note } })
    .returning();
  return row;
}

export async function addRestDay(tx: Tx, input: { day: string; reason: string | null }) {
  const [row] = await tx.insert(restDays).values(input).onConflictDoUpdate({ target: [restDays.userId, restDays.day], set: { reason: input.reason } }).returning();
  return row;
}

export async function removeRestDay(tx: Tx, id: string) {
  const [row] = await tx.delete(restDays).where(eq(restDays.id, id)).returning();
  if (!row) throw notFound("Rest day");
}

// ---------------------------------------------------------------------------
// Analysis

export const toDef = (h: HabitRow): HabitDef => ({
  id: h.id,
  name: h.name,
  scheduleKind: h.scheduleKind,
  scheduleDays: h.scheduleDays,
  weeklyTarget: h.weeklyTarget,
  startedOn: h.startedOn,
});

/** Share of each day's top priorities (MITs) completed that day. */
async function mitScores(tx: Tx, from: IsoDate, to: IsoDate, timezone: string) {
  const rows = await tx
    .select({
      day: tasks.mitOn,
      total: count(),
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done' and (${tasks.completedAt} at time zone ${timezone})::date <= ${tasks.mitOn})::int`,
    })
    .from(tasks)
    .where(and(isNotNull(tasks.mitOn), gte(tasks.mitOn, from), lte(tasks.mitOn, to)))
    .groupBy(tasks.mitOn);
  return new Map(rows.map((r) => [r.day!, r.done / r.total]));
}

export async function loadContext(tx: Tx, habitIds: string[], since: IsoDate, today: IsoDate, weekStartsOn: number) {
  const rows = habitIds.length
    ? await tx
        .select({ habitId: habitCheckins.habitId, day: habitCheckins.checkinOn, status: habitCheckins.status, note: habitCheckins.note })
        .from(habitCheckins)
        .where(and(inArray(habitCheckins.habitId, habitIds), gte(habitCheckins.checkinOn, since)))
    : [];
  const rest = await tx.select().from(restDays).where(gte(restDays.day, since)).orderBy(asc(restDays.day));
  const restSet = new Set(rest.map((r) => r.day));
  const ctxFor = (habitId: string): HabitContext => ({
    checkins: new Map(rows.filter((r) => r.habitId === habitId).map((r) => [r.day, { status: r.status, note: r.note }])),
    restDays: restSet,
    today,
    weekStartsOn,
  });
  return { ctxFor, rest };
}

export async function getHabitsOverview(tx: Tx) {
  const ws = await requireWorkspace(tx);
  await ensureDefaultHabits(tx);
  const today = ws.today;
  const weekStartsOn = ws.profile?.weekStartsOn ?? 1;
  const list = await tx.select().from(habits).where(isNull(habits.archivedAt)).orderBy(asc(habits.sortOrder), asc(habits.name));
  const earliest = list.reduce((m, h) => (h.startedOn < m ? h.startedOn : m), today);
  const since = earliest < addMonths(today, -60) ? addMonths(today, -60) : earliest;
  const { ctxFor, rest } = await loadContext(tx, list.map((h) => h.id), since, today, weekStartsOn);
  const mits = await mitScores(tx, addDays(today, -90), today, ws.profile?.timezone ?? "UTC");
  const weekStart = startOfWeek(today, weekStartsOn);
  const monthStart = `${today.slice(0, 7)}-01`;
  const last14 = [...Array(14)].map((_, i) => addDays(today, i - 13));

  const items = list.map((h) => {
    const def = toDef(h);
    const ctx = ctxFor(h.id);
    const todayCheckin = ctx.checkins.get(today) ?? null;
    const weekDone = [...ctx.checkins.entries()].filter(([d, c]) => d >= weekStart && d <= today && c.status === "done").length;
    return {
      habit: h,
      today: { status: todayCheckin?.status ?? null, state: dayState(def, today, ctx), expected: h.scheduleKind === "weekly" || h.scheduleDays.includes(new Date(`${today}T00:00:00Z`).getUTCDay()) },
      weekDone,
      week: consistency(def, weekStart, addDays(weekStart, 6), ctx),
      month: consistency(def, monthStart, today, ctx),
      last30: consistency(def, addDays(today, -29), today, ctx),
      streak: streaks(def, ctx),
      recent: last14.map((d) => ({ day: d, state: dayState(def, d, ctx), status: ctx.checkins.get(d)?.status ?? null })),
      missed: missedAnalysis(def, addDays(today, -89), ctx),
      correlation: priorityCorrelation(def, addDays(today, -89), ctx, mits),
      trend: weeklyTrend([{ def, ctx }], 12, today, weekStartsOn),
    };
  });

  const overall = weeklyTrend(
    list.map((h) => ({ def: toDef(h), ctx: ctxFor(h.id) })),
    12,
    today,
    weekStartsOn,
  );
  const correlations = items
    .filter((i) => i.correlation.enough && i.correlation.difference != null)
    .map((i) => ({ habitId: i.habit.id, name: i.habit.name, ...i.correlation }))
    .sort((a, b) => (b.difference ?? 0) - (a.difference ?? 0));
  return {
    today,
    weekStart,
    isRestDay: rest.some((r) => r.day === today),
    restDays: rest.filter((r) => r.day >= addDays(today, -30)),
    items,
    overall,
    correlations,
    mitDays: mits.size,
  };
}

/** One habit's full history: a day grid back to its start (up to a year) and every note. */
export async function getHabitHistory(tx: Tx, id: string) {
  const ws = await requireWorkspace(tx);
  const h = await findHabit(tx, id);
  const today = ws.today;
  const weekStartsOn = ws.profile?.weekStartsOn ?? 1;
  const from = startOfWeek(h.startedOn > addDays(today, -364) ? h.startedOn : addDays(today, -364), weekStartsOn);
  const { ctxFor } = await loadContext(tx, [h.id], h.startedOn < addMonths(today, -60) ? addMonths(today, -60) : h.startedOn, today, weekStartsOn);
  const def = toDef(h);
  const ctx = ctxFor(h.id);
  const weeks: { weekStart: IsoDate; days: { day: IsoDate; state: ReturnType<typeof dayState>; status: CheckinStatus | null }[] }[] = [];
  for (let w = from; w <= today; w = addDays(w, 7)) {
    weeks.push({ weekStart: w, days: [...Array(7)].map((_, i) => addDays(w, i)).map((d) => ({ day: d, state: dayState(def, d, ctx), status: ctx.checkins.get(d)?.status ?? null })) });
  }
  const notes = await tx
    .select({ day: habitCheckins.checkinOn, status: habitCheckins.status, note: habitCheckins.note })
    .from(habitCheckins)
    .where(and(eq(habitCheckins.habitId, id), isNotNull(habitCheckins.note)))
    .orderBy(desc(habitCheckins.checkinOn))
    .limit(50);
  const [{ n: total }] = await tx.select({ n: count() }).from(habitCheckins).where(and(eq(habitCheckins.habitId, id), eq(habitCheckins.status, "done")));
  return {
    today,
    habit: h,
    weeks,
    notes,
    totalDone: total,
    allTime: consistency(def, h.startedOn, today, ctx),
    streak: streaks(def, ctx),
    missed: missedAnalysis(def, addDays(today, -89), ctx),
  };
}
