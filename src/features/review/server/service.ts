/**
 * Weekly review service: gathers the week's tracked data across modules,
 * produces the cross-pillar report, direct observations, recurring patterns
 * and next-week goal suggestions, and records your answers.
 */
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import {
  commPracticeSessions,
  contentItems,
  deals,
  financeExpenses,
  financeIncome,
  financeSettings,
  goals,
  habitCheckins,
  habits,
  knowledgeResources,
  productFeatures,
  productFeedback,
  productInterviews,
  productReleases,
  products,
  productTransactions,
  productValidationSteps,
  prospects,
  psychReviews,
  readingSessions,
  restDays,
  salesActivities,
  tasks,
  weekReviews,
} from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import { createWeeklyGoal, getWeek, reviewWeek, saveWeekPlan } from "@/features/weekly/server/service";
import type { WeeklyGoalCreateInput } from "@/features/weekly/schemas";
import { addDays } from "@/lib/domain/dates";
import { consistency, type HabitContext } from "@/lib/domain/habits";
import {
  addMoney,
  observations,
  recurringPatterns,
  suggestGoals,
  type Money,
  type PastReview,
  type ReviewAnswers,
  type WeekSignals,
} from "@/lib/domain/review";
import { FOCUS_AREA_PILLAR, FOCUS_AREAS, shiftWeek, weekOf } from "@/lib/domain/weekly";
import { AppError } from "@/lib/errors";

const EMPTY_ANSWERS: ReviewAnswers = {
  missed: [],
  completedNotes: null,
  biggestAchievement: null,
  learned: null,
  revenue: null,
  interest: null,
  wastedTime: null,
  stopDoing: null,
  continueDoing: null,
  changeNextWeek: null,
};

const TERMINAL = ["achieved", "missed", "abandoned"] as const;

async function habitWeek(tx: Tx, from: string, to: string, today: string, weekStartsOn: number) {
  const list = await tx.select().from(habits).where(isNull(habits.archivedAt));
  if (!list.length) return { rate: null, done: 0, expected: 0, weakest: null };
  const rows = await tx.select().from(habitCheckins).where(and(inArray(habitCheckins.habitId, list.map((h) => h.id)), gte(habitCheckins.checkinOn, addDays(from, -7)), lte(habitCheckins.checkinOn, to)));
  const rest = new Set((await tx.select({ day: restDays.day }).from(restDays).where(and(gte(restDays.day, from), lte(restDays.day, to)))).map((r) => r.day));
  let done = 0;
  let expected = 0;
  let weakest: { name: string; rate: number } | null = null;
  for (const h of list) {
    const ctx: HabitContext = {
      checkins: new Map(rows.filter((r) => r.habitId === h.id).map((r) => [r.checkinOn, { status: r.status, note: r.note }])),
      restDays: rest,
      today: to < today ? to : today,
      weekStartsOn,
    };
    const c = consistency({ id: h.id, name: h.name, scheduleKind: h.scheduleKind, scheduleDays: h.scheduleDays, weeklyTarget: h.weeklyTarget, startedOn: h.startedOn }, from, to, ctx);
    done += c.done;
    expected += c.expected;
    if (c.rate != null && c.expected >= 2 && (!weakest || c.rate < weakest.rate)) weakest = { name: h.name, rate: c.rate };
  }
  return { rate: expected ? done / expected : null, done, expected, weakest };
}

/** Everything tracked in the week, across modules. */
export async function gatherSignals(tx: Tx, weekStart: string) {
  const detail = await getWeek(tx, weekStart);
  const ws = detail.workspace;
  const { weekStart: from, weekEnd: to } = detail.week;
  const pillarKey = new Map(ws.pillars.map((p) => [p.id, p.key]));
  const tz = ws.profile?.timezone ?? "UTC";
  const localDay = (col: unknown) => sql`(${col} at time zone ${tz})::date`;
  const nextWeek = shiftWeek(from, 1);

  const parentIds = detail.weeklyGoals.map((g) => g.parentId).filter((x): x is string => !!x);
  const parents = parentIds.length ? await tx.select().from(goals).where(inArray(goals.id, parentIds)) : [];
  const parentActive = new Map(parents.map((p) => [p.id, !(TERMINAL as readonly string[]).includes(p.status) && p.targetDate >= nextWeek && !p.archivedAt]));

  const weekTasks = await tx.select().from(tasks).where(and(isNull(tasks.archivedAt), eq(tasks.plannedWeek, from)));
  const doneTasks = weekTasks.filter((t) => t.status === "done");
  const minutes = (xs: typeof weekTasks) => xs.reduce((a, t) => a + (t.actualMinutes ?? 0), 0);
  const mitRows = await tx.select({ status: tasks.status, mitOn: tasks.mitOn }).from(tasks).where(and(isNotNull(tasks.mitOn), gte(tasks.mitOn, from), lte(tasks.mitOn, to)));

  const habitsNow = await habitWeek(tx, from, to, ws.today, ws.weekStartsOn);
  const habitsPrev = await habitWeek(tx, shiftWeek(from, -1), addDays(from, -1), ws.today, ws.weekStartsOn);

  // Sales mastery
  const acts = await tx.select({ kind: salesActivities.kind, connected: salesActivities.connected, meeting: salesActivities.meetingBooked }).from(salesActivities).where(and(gte(salesActivities.occurredOn, from), lte(salesActivities.occurredOn, to)));
  const newProspects = await tx.select({ contentItemId: prospects.contentItemId }).from(prospects).where(and(gte(localDay(prospects.createdAt), from), lte(localDay(prospects.createdAt), to)));
  const won = await tx.select({ amount: deals.amount, currency: deals.currency }).from(deals).where(and(eq(deals.stage, "won"), gte(deals.closedOn, from), lte(deals.closedOn, to)));
  const practice = await tx.select({ minutes: commPracticeSessions.durationMinutes }).from(commPracticeSessions).where(and(gte(commPracticeSessions.practicedOn, from), lte(commPracticeSessions.practicedOn, to)));
  const [{ n: psych }] = await tx.select({ n: count() }).from(psychReviews).where(and(gte(psychReviews.reviewedOn, from), lte(psychReviews.reviewedOn, to)));

  // Product entrepreneurship
  const ptx = await tx
    .select({ amount: productTransactions.amount, category: productTransactions.category, kind: productTransactions.kind, currency: products.currency })
    .from(productTransactions)
    .innerJoin(products, eq(products.id, productTransactions.productId))
    .where(and(eq(productTransactions.kind, "revenue"), gte(productTransactions.occurredOn, from), lte(productTransactions.occurredOn, to)));
  const productRevenue: Money = {};
  for (const t of ptx) addMoney(productRevenue, t.currency, t.category === "refund" ? -t.amount : t.amount);
  const interviews = await tx.select({ willingness: productInterviews.willingness }).from(productInterviews).where(and(gte(productInterviews.interviewedOn, from), lte(productInterviews.interviewedOn, to)));
  const [{ n: feedback }] = await tx.select({ n: count() }).from(productFeedback).where(and(gte(productFeedback.receivedOn, from), lte(productFeedback.receivedOn, to)));
  const [{ n: shipped }] = await tx.select({ n: count() }).from(productFeatures).where(and(gte(productFeatures.shippedOn, from), lte(productFeatures.shippedOn, to)));
  const [{ n: releases }] = await tx.select({ n: count() }).from(productReleases).where(and(gte(productReleases.releasedOn, from), lte(productReleases.releasedOn, to)));
  const [{ n: validated }] = await tx.select({ n: count() }).from(productValidationSteps).where(and(eq(productValidationSteps.status, "validated"), gte(productValidationSteps.decidedOn, from), lte(productValidationSteps.decidedOn, to)));

  // Personal branding
  const published = await tx.select({ title: contentItems.title }).from(contentItems).where(and(isNull(contentItems.archivedAt), gte(contentItems.publishedOn, from), lte(contentItems.publishedOn, to)));

  // Financial independence
  const [fs] = await tx.select({ currency: financeSettings.currency }).from(financeSettings).limit(1);
  const inc = await tx.select({ source: financeIncome.source, amount: financeIncome.amount }).from(financeIncome).where(and(gte(financeIncome.receivedOn, from), lte(financeIncome.receivedOn, to)));
  const [{ spent }] = await tx.select({ spent: sql<string>`coalesce(sum(${financeExpenses.amount}), 0)` }).from(financeExpenses).where(and(gte(financeExpenses.spentOn, from), lte(financeExpenses.spentOn, to)));
  const incomeBySource: Record<string, number> = {};
  for (const i of inc) incomeBySource[i.source] = Math.round(((incomeBySource[i.source] ?? 0) + i.amount) * 100) / 100;
  const incomeByCurrency: Money = {};
  if (fs) for (const i of inc) addMoney(incomeByCurrency, fs.currency, i.amount);

  // Learning
  const [{ readMin }] = await tx.select({ readMin: sql<number>`coalesce(sum(${readingSessions.minutes}), 0)::int` }).from(readingSessions).where(and(gte(readingSessions.readOn, from), lte(readingSessions.readOn, to)));
  const completed = await tx.select({ title: knowledgeResources.title }).from(knowledgeResources).where(and(gte(knowledgeResources.completedOn, from), lte(knowledgeResources.completedOn, to)));

  // Pillars with active annual/quarterly objectives covering the week.
  const objectives = await tx
    .select({ id: goals.id, title: goals.title, level: goals.level, pillarId: goals.pillarId, targetDate: goals.targetDate })
    .from(goals)
    .where(
      and(
        eq(goals.journeyId, ws.journey.id),
        isNull(goals.archivedAt),
        inArray(goals.level, ["annual", "quarterly", "monthly"]),
        eq(goals.isKeyResult, false),
        lte(goals.startDate, addDays(nextWeek, 6)),
        gte(goals.targetDate, nextWeek),
        notInArray(goals.status, [...TERMINAL]),
      ),
    )
    .orderBy(sql`case ${goals.level} when 'quarterly' then 0 when 'monthly' then 1 else 2 end`, asc(goals.targetDate));
  const activePillars = [...new Set(objectives.map((o) => (o.pillarId ? pillarKey.get(o.pillarId) : null)).filter((x): x is string => !!x))];

  const won$: Money = {};
  for (const d of won) addMoney(won$, d.currency, d.amount ?? 0);
  const signals: WeekSignals = {
    goals: detail.weeklyGoals.map((g) => ({
      id: g.id,
      title: g.title,
      pillarKey: g.pillarId ? (pillarKey.get(g.pillarId) ?? null) : null,
      area: g.focusArea,
      met: g.isTargetMet || g.status === "achieved",
      completionPct: g.completionPct,
      parentId: g.parentId,
      parentActive: g.parentId ? (parentActive.get(g.parentId) ?? false) : false,
      successMetric: g.successMetric,
      unit: g.unit,
      targetValue: Number(g.targetValue),
      baselineValue: Number(g.baselineValue),
      measurementMode: g.measurementMode,
    })),
    deliverables: {
      planned: weekTasks.filter((t) => t.isDeliverable && t.status !== "cancelled").length,
      delivered: doneTasks.filter((t) => t.isDeliverable).length,
      titles: doneTasks.filter((t) => t.isDeliverable).map((t) => t.title),
    },
    time: {
      actualMinutes: minutes(doneTasks),
      deliverableMinutes: minutes(doneTasks.filter((t) => t.isDeliverable)),
      routineMinutes: minutes(doneTasks.filter((t) => !t.isDeliverable)),
      estimateRatio: detail.scorecard.time.estimateRatio,
      capacityMinutes: detail.scorecard.time.capacityMinutes,
    },
    carried: {
      carriedIn: detail.scorecard.tasks.carriedIn,
      chronic: weekTasks.filter((t) => t.carryCount >= 2 && t.status !== "done" && t.status !== "cancelled").map((t) => ({ title: t.title, carryCount: t.carryCount })),
    },
    mits: { set: mitRows.length, done: mitRows.filter((t) => t.status === "done").length, daysWithMits: new Set(mitRows.map((t) => t.mitOn)).size },
    habits: { ...habitsNow, previousRate: habitsPrev.rate },
    sales: {
      activities: acts.length,
      calls: acts.filter((a) => a.kind === "cold_call").length,
      connected: acts.filter((a) => a.kind === "cold_call" && a.connected).length,
      meetings: acts.filter((a) => a.meeting).length,
      newProspects: newProspects.length,
      prospectsFromContent: newProspects.filter((p) => p.contentItemId).length,
      dealsWon: won.length,
      wonByCurrency: won$,
      practiceSessions: practice.length,
      practiceMinutes: practice.reduce((a, p) => a + (p.minutes ?? 0), 0),
      psychReviews: psych,
    },
    product: {
      revenueByCurrency: productRevenue,
      interviews: interviews.length,
      committed: interviews.filter((i) => i.willingness === "committed" || i.willingness === "paid").length,
      feedback,
      featuresShipped: shipped,
      releases,
      stepsValidated: validated,
    },
    brand: { published: published.length, titles: published.map((p) => p.title), attributedProspects: newProspects.filter((p) => p.contentItemId).length },
    wealth: { incomeByCurrency, incomeBySource, expenses: Number(spent), currency: fs?.currency ?? null },
    learning: { readingMinutes: readMin, completed: completed.map((c) => c.title) },
    activePillars,
  };
  const areaFor = (key: string) => FOCUS_AREAS.find((a) => FOCUS_AREA_PILLAR[a] === key) ?? "personal";
  const pillarObjectives = ws.pillars.flatMap((p) => {
    const o = objectives.find((x) => x.pillarId === p.id);
    return o ? [{ pillarKey: p.key, pillarName: p.name, objectiveId: o.id, objectiveTitle: o.title, area: areaFor(p.key) }] : [];
  });
  return { detail, signals, pillarObjectives, pillars: ws.pillars, nextWeek, today: ws.today };
}

const fmtMoney = (n: number, c: string) => new Intl.NumberFormat("en", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

/** The week to review by default: this week from its last two days on, otherwise last week. */
export async function defaultReviewWeek(tx: Tx) {
  const ws = await requireWorkspace(tx);
  const current = weekOf(ws.today, ws.weekStartsOn);
  return ws.today >= addDays(current.weekEnd, -1) ? current.weekStart : shiftWeek(current.weekStart, -1);
}

export async function getReview(tx: Tx, weekStartArg?: string) {
  const weekStart = weekStartArg ?? (await defaultReviewWeek(tx));
  const g = await gatherSignals(tx, weekStart);
  if (g.detail.week.weekStart > g.today) throw new AppError(422, "week_not_started", "You can only review a week that has started.");
  const [row] = await tx.select().from(weekReviews).where(eq(weekReviews.weekStart, g.detail.week.weekStart)).limit(1);
  const answers = row?.answers ?? EMPTY_ANSWERS;
  const obs = observations(g.signals, fmtMoney);

  const past = await tx
    .select()
    .from(weekReviews)
    .where(and(isNotNull(weekReviews.completedAt), lt(weekReviews.weekStart, g.detail.week.weekStart)))
    .orderBy(desc(weekReviews.weekStart))
    .limit(7);
  const toPast = (weekStartP: string, a: ReviewAnswers, snap: Record<string, unknown> | null): PastReview => ({
    weekStart: weekStartP,
    answers: a,
    score: (snap?.score as number | null) ?? null,
    missedAreas: (snap?.missedAreas as string[]) ?? [],
    estimateRatio: (snap?.estimateRatio as number | null) ?? null,
    pillarsWithoutGoals: (snap?.pillarsWithoutGoals as string[]) ?? [],
  });
  const thisWeekPast = toPast(g.detail.week.weekStart, answers, snapshotOf(g, answers));
  const pillarNames = Object.fromEntries(g.pillars.map((p) => [p.key, p.name]));
  const patterns = recurringPatterns([thisWeekPast, ...past.map((r) => toPast(r.weekStart, r.answers, r.snapshot))], pillarNames);

  const suggestions = suggestGoals(g.signals, answers, g.pillarObjectives);
  const nextWeekGoals = await tx
    .select({ title: goals.title, parentId: goals.parentId })
    .from(goals)
    .where(and(eq(goals.level, "weekly"), isNull(goals.archivedAt), gte(goals.startDate, g.nextWeek), lte(goals.startDate, addDays(g.nextWeek, 6))));
  const approved = new Set(nextWeekGoals.map((x) => `${x.parentId}|${x.title.toLowerCase()}`));
  const parentIds = [...new Set(suggestions.map((x) => x.parentId).filter((x): x is string => !!x))];
  const parentTitles = new Map(
    parentIds.length ? (await tx.select({ id: goals.id, title: goals.title }).from(goals).where(inArray(goals.id, parentIds))).map((r) => [r.id, r.title] as const) : [],
  );

  return {
    today: g.today,
    week: g.detail.week,
    previousWeek: shiftWeek(g.detail.week.weekStart, -1),
    nextWeek: g.nextWeek,
    canGoForward: shiftWeek(g.detail.week.weekStart, 1) <= g.today,
    review: row ?? null,
    answers,
    signals: g.signals,
    scorecard: g.detail.scorecard,
    pillars: g.pillars,
    observations: obs,
    patterns,
    suggestions: suggestions.map((s) => ({ ...s, parentTitle: s.parentId ? (parentTitles.get(s.parentId) ?? null) : null, approved: approved.has(`${s.parentId}|${s.title.toLowerCase()}`) })),
    parentOptions: g.pillarObjectives,
    nextWeekGoals: nextWeekGoals.length,
    pastReviews: past.map((r) => ({ weekStart: r.weekStart, score: (r.snapshot?.score as number | null) ?? null })),
  };
}

function snapshotOf(g: Awaited<ReturnType<typeof gatherSignals>>, answers: ReviewAnswers) {
  const missedAreas = g.signals.goals.filter((x) => !x.met && x.area).map((x) => x.area!);
  const withGoals = new Set(g.signals.goals.map((x) => x.pillarKey));
  return {
    score: g.detail.scorecard.score,
    missedAreas: [...new Set(missedAreas)],
    estimateRatio: g.detail.scorecard.time.estimateRatio,
    pillarsWithoutGoals: g.signals.activePillars.filter((p) => !withGoals.has(p)),
    missedReasons: answers.missed.map((m) => m.reason),
  };
}

/** Saves answers (draft). Only goals of that week can be marked missed. */
export async function saveReview(tx: Tx, weekStartArg: string, answers: ReviewAnswers) {
  const g = await gatherSignals(tx, weekStartArg);
  const goalIds = new Set(g.signals.goals.map((x) => x.id));
  if (answers.missed.some((m) => !goalIds.has(m.goalId))) throw new AppError(422, "validation_failed", "A missed goal doesn't belong to this week.");
  const [row] = await tx
    .insert(weekReviews)
    .values({ weekStart: g.detail.week.weekStart, answers })
    .onConflictDoUpdate({ target: [weekReviews.userId, weekReviews.weekStart], set: { answers } })
    .returning();
  return { row, g };
}

/** Completes the review: answers saved, report frozen, the week marked reviewed (scorecard frozen too). */
export async function completeReview(tx: Tx, weekStartArg: string, answers: ReviewAnswers) {
  const { g } = await saveReview(tx, weekStartArg, answers);
  const missedWithoutReason = g.signals.goals.filter((x) => !x.met && !answers.missed.some((m) => m.goalId === x.id));
  if (missedWithoutReason.length) {
    throw new AppError(422, "reasons_required", `Say why each missed goal was missed before completing the review (${missedWithoutReason.map((x) => `"${x.title}"`).join(", ")}).`);
  }
  const snapshot = {
    ...snapshotOf(g, answers),
    signals: g.signals,
    observations: observations(g.signals, fmtMoney),
  };
  const [row] = await tx
    .update(weekReviews)
    .set({ snapshot, completedAt: new Date() })
    .where(eq(weekReviews.weekStart, g.detail.week.weekStart))
    .returning();
  await reviewWeek(tx, g.detail.week.weekStart, { wins: answers.biggestAchievement, lessons: answers.learned, notes: answers.changeNextWeek });
  return row;
}

/** Creates an approved (possibly edited) suggestion as a goal for the week after the reviewed one. */
export async function approveSuggestion(tx: Tx, reviewWeekStart: string, input: WeeklyGoalCreateInput) {
  return createWeeklyGoal(tx, shiftWeek(reviewWeekStart, 1), input);
}

/** Uses "what should I change" as next week's focus. */
export async function setNextWeekFocus(tx: Tx, reviewWeekStart: string, focus: string) {
  return saveWeekPlan(tx, shiftWeek(reviewWeekStart, 1), { focus });
}
