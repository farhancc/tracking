/**
 * The advisor's tools. Read tools return compact summaries of the signed-in
 * user's data and run in a transaction that is always rolled back, so nothing
 * they touch can persist. Proposal tools only record a pending proposal; the
 * change happens when the user confirms it (see proposals.ts).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { TransactionRollbackError } from "drizzle-orm/errors";
import { withUser } from "@/db/client";
import type { Tx } from "@/db/drizzle";
import { advisorProposals, deals, goals, prospects, salesActivities, salesJournalEntries, tasks, weekReviews } from "@/db/schema";
import { getOverview as getCommunication } from "@/features/communication/server/service";
import { getAnalytics } from "@/features/content/server/analytics";
import { getDashboard as getFinance } from "@/features/finance/server/service";
import { getCurrentVision, listGoals, requireWorkspace } from "@/features/goals/server/service";
import { getHabitsOverview } from "@/features/habits/server/service";
import { getReading } from "@/features/knowledge/server/service";
import { getPortfolio } from "@/features/products/server/service";
import { getStats as getPsychStats } from "@/features/psychology/server/service";
import { getWeek } from "@/features/weekly/server/service";
import { addDays } from "@/lib/domain/dates";
import { journeyDay } from "@/lib/domain/daily";
import { weekOf } from "@/lib/domain/weekly";

type ToolDef = Anthropic.Beta.BetaTool;
const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({
  type: "object" as const,
  additionalProperties: false,
  properties,
  required,
});
const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, "null"], ...extra });

export const READ_TOOLS: ToolDef[] = [
  { name: "get_overview", description: "Five-year vision, journey position, pillars, and all five-year, annual and quarterly goals with progress vs expected progress and health.", input_schema: obj({}), strict: true },
  {
    name: "get_goals",
    description: "Goals at one level (five_year, annual, quarterly, monthly, weekly) with progress, expected progress, health, status and dates.",
    input_schema: obj({ level: { type: "string", enum: ["five_year", "annual", "quarterly", "monthly", "weekly"] } }),
    strict: true,
  },
  {
    name: "get_week",
    description: "A week's plan: weekly goals and completion, scorecard (score, deliverables, time vs estimates, carried tasks) and the completed review if there is one. weekStart null = this week.",
    input_schema: obj({ weekStart: nullable("string", { description: "YYYY-MM-DD week start, or null" }) }),
    strict: true,
  },
  {
    name: "get_tasks",
    description: "Tasks: overdue (past due, not done), this_week (planned this week) or today (scheduled or top priority today).",
    input_schema: obj({ scope: { type: "string", enum: ["overdue", "this_week", "today"] } }),
    strict: true,
  },
  { name: "get_sales", description: "Sales performance over the last N days: activities, connect rate, meetings, deals won/lost by currency, open pipeline, new prospects, journal lessons.", input_schema: obj({ days: { type: "integer", enum: [30, 90] } }), strict: true },
  { name: "get_products", description: "Product portfolio: stage, status, MRR, customers, churn, profit, demand evidence and the rule-based recommendation with its reasons.", input_schema: obj({}), strict: true },
  { name: "get_content", description: "Content performance by pillar and format over a window: engagement, trust signals, leads, attributed prospects, won deals, plus data-backed insights.", input_schema: obj({ window: { type: "string", enum: ["30", "90", "365"] } }), strict: true },
  { name: "get_communication", description: "Communication skills: assessed level, target, gap, practice in the last 30 days, assessment due.", input_schema: obj({}), strict: true },
  { name: "get_finance", description: "Finance actuals: savings rate, annual income, business profit, recurring business income, net worth, debt, FI target and progress (with assumptions), milestones.", input_schema: obj({}), strict: true },
  { name: "get_habits", description: "Habit consistency (week, month), streaks, missed-day analysis and the correlation with daily priorities.", input_schema: obj({}), strict: true },
  { name: "get_reviews", description: "Recent completed weekly reviews: score, data-based observations, missed-goal reasons, stop/continue/change answers.", input_schema: obj({ count: { type: "integer", enum: [4, 8] } }), strict: true },
  { name: "get_learning", description: "Reading goal and daily reading, plus the psychology lab: concepts learned, applied, needing study.", input_schema: obj({}), strict: true },
];

export const PROPOSAL_TOOLS: ToolDef[] = [
  {
    name: "propose_goal_change",
    description: "Propose changing a goal (title, target, target date, priority or status). Nothing changes until the user confirms. Use null for fields that stay the same.",
    input_schema: obj({
      goalId: { type: "string" },
      title: nullable("string"),
      targetValue: nullable("number"),
      targetDate: nullable("string", { description: "YYYY-MM-DD" }),
      priority: nullable("integer", { enum: [1, 2, 3, 4, null] }),
      status: nullable("string", { enum: ["not_started", "in_progress", "at_risk", "on_hold", "achieved", "missed", "abandoned", null] }),
      reason: { type: "string" },
    }),
    strict: true,
  },
  { name: "propose_archive_goal", description: "Propose archiving a goal (and its sub-goals). Requires the user's confirmation.", input_schema: obj({ goalId: { type: "string" }, reason: { type: "string" } }), strict: true },
  {
    name: "propose_task",
    description: "Propose a new task, optionally linked to a goal and a planned week. Requires the user's confirmation.",
    input_schema: obj({ title: { type: "string" }, goalId: nullable("string"), plannedWeek: nullable("string", { description: "YYYY-MM-DD week start" }), reason: { type: "string" } }),
    strict: true,
  },
  { name: "propose_delete_task", description: "Propose deleting a task permanently. Requires the user's confirmation.", input_schema: obj({ taskId: { type: "string" }, reason: { type: "string" } }), strict: true },
];

export const ALL_TOOLS = [...READ_TOOLS, ...PROPOSAL_TOOLS];
const READ_NAMES = new Set(READ_TOOLS.map((t) => t.name));

/** Runs a function in a user-scoped transaction (withUser in the app; injectable for tests). */
export type RunAs = <T>(userId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;

/** Runs fn and rolls the transaction back, whatever fn did. */
export async function readOnly<T>(userId: string, fn: (tx: Tx) => Promise<T>, runAs: RunAs = withUser): Promise<T> {
  let result: T | undefined;
  try {
    await runAs(userId, async (tx) => {
      result = await fn(tx);
      tx.rollback();
    });
  } catch (e) {
    if (!(e instanceof TransactionRollbackError)) throw e;
  }
  return result as T;
}

const pct = (x: number | null | undefined) => (x == null ? null : Math.round(x * 1000) / 10);

async function goalSummaries(tx: Tx, level: string) {
  const list = await listGoals(tx, { level: level as never });
  const ws = await requireWorkspace(tx);
  const pillar = new Map(ws.pillars.map((p) => [p.id, p.name]));
  return list.map((g) => ({
    id: g.id,
    title: g.title,
    level: g.level,
    pillar: g.pillarId ? (pillar.get(g.pillarId) ?? null) : null,
    status: g.status,
    progressPct: g.completionPct,
    expectedPct: g.expectedPct,
    health: g.health,
    metric: g.successMetric,
    current: g.currentValue,
    target: g.targetValue,
    unit: g.unit,
    startDate: g.startDate,
    targetDate: g.targetDate,
    parentId: g.parentId,
  }));
}

type Input = Record<string, unknown>;

async function runRead(tx: Tx, name: string, input: Input): Promise<unknown> {
  const ws = await requireWorkspace(tx);
  const today = ws.today;
  switch (name) {
    case "get_overview": {
      const vision = await getCurrentVision(tx, ws.journey.id);
      return {
        today,
        journey: { name: ws.journey.name, startDate: ws.journey.startDate, ...journeyDay(ws.journey, today) },
        vision: vision ? { statement: vision.statement ?? null, professionalIdentity: vision.professionalIdentity ?? null, updatedAt: vision.updatedAt } : null,
        pillars: ws.pillars.map((p) => ({ key: p.key, name: p.name })),
        fiveYear: await goalSummaries(tx, "five_year"),
        annual: await goalSummaries(tx, "annual"),
        quarterly: await goalSummaries(tx, "quarterly"),
      };
    }
    case "get_goals":
      return { today, goals: await goalSummaries(tx, String(input.level)) };
    case "get_week": {
      const weekStart = typeof input.weekStart === "string" ? weekOf(input.weekStart, ws.weekStartsOn).weekStart : undefined;
      const w = await getWeek(tx, weekStart);
      const [review] = await tx.select().from(weekReviews).where(eq(weekReviews.weekStart, w.week.weekStart)).limit(1);
      const snap = review?.snapshot as { observations?: { text: string }[] } | null | undefined;
      return {
        week: w.week,
        focus: w.plan?.focus ?? null,
        weeklyGoals: w.weeklyGoals.map((g) => ({ id: g.id, title: g.title, area: g.focusArea, progressPct: g.completionPct, met: g.isTargetMet, parent: g.parentTitle })),
        scorecard: { score: w.scorecard.score, goals: w.scorecard.goals, deliverables: w.scorecard.deliverables, tasks: w.scorecard.tasks, estimateRatio: w.scorecard.time.estimateRatio },
        unfinishedFromEarlierWeeks: w.unfinished.length,
        review: review?.completedAt ? { observations: snap?.observations?.map((o) => o.text) ?? [], missed: review.answers.missed, stopDoing: review.answers.stopDoing, changeNextWeek: review.answers.changeNextWeek } : null,
      };
    }
    case "get_tasks": {
      const scope = String(input.scope);
      const week = weekOf(today, ws.weekStartsOn).weekStart;
      const where =
        scope === "overdue"
          ? and(isNull(tasks.archivedAt), lt(tasks.dueOn, today), inArray(tasks.status, ["todo", "doing"]))
          : scope === "this_week"
            ? and(isNull(tasks.archivedAt), eq(tasks.plannedWeek, week))
            : and(isNull(tasks.archivedAt), sql`(${tasks.scheduledOn} = ${today} or ${tasks.mitOn} = ${today})`);
      const rows = await tx.select().from(tasks).where(where).orderBy(asc(tasks.priority), asc(tasks.dueOn)).limit(40);
      return { today, scope, tasks: rows.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueOn: t.dueOn, plannedWeek: t.plannedWeek, deliverable: t.isDeliverable, mit: t.mitOn === today ? t.mitRank : null, carried: t.carryCount, goalId: t.goalId })) };
    }
    case "get_sales": {
      const days = Number(input.days) || 30;
      const from = addDays(today, -days + 1);
      const acts = await tx.select({ kind: salesActivities.kind, connected: salesActivities.connected, meeting: salesActivities.meetingBooked, qualified: salesActivities.qualified }).from(salesActivities).where(gte(salesActivities.occurredOn, from));
      const closed = await tx.select({ stage: deals.stage, amount: deals.amount, currency: deals.currency, lostReason: deals.lostReason }).from(deals).where(and(isNotNull(deals.closedOn), gte(deals.closedOn, from)));
      const open = await tx.select({ amount: deals.amount, currency: deals.currency }).from(deals).where(isNull(deals.closedOn));
      const byCur = (rows: { amount: number | null; currency: string }[]) =>
        rows.reduce<Record<string, number>>((a, d) => ((a[d.currency] = Math.round(((a[d.currency] ?? 0) + (d.amount ?? 0)) * 100) / 100), a), {});
      const [{ n: newProspects }] = await tx.select({ n: count() }).from(prospects).where(gte(sql`${prospects.createdAt}::date`, from));
      const [{ n: lessons }] = await tx.select({ n: count() }).from(salesJournalEntries).where(gte(salesJournalEntries.occurredOn, from));
      const calls = acts.filter((a) => a.kind === "cold_call");
      return {
        period: { from, to: today, days },
        activities: acts.length,
        byKind: acts.reduce<Record<string, number>>((a, x) => ((a[x.kind] = (a[x.kind] ?? 0) + 1), a), {}),
        coldCalls: calls.length,
        connectRatePct: calls.length ? pct(calls.filter((c) => c.connected).length / calls.length) : null,
        meetingsBooked: acts.filter((a) => a.meeting).length,
        qualified: acts.filter((a) => a.qualified).length,
        dealsWon: closed.filter((d) => d.stage === "won").length,
        wonByCurrency: byCur(closed.filter((d) => d.stage === "won")),
        dealsLost: closed.filter((d) => d.stage === "lost").length,
        lostReasons: closed.filter((d) => d.stage === "lost" && d.lostReason).map((d) => d.lostReason),
        openDeals: open.length,
        openPipelineByCurrency: byCur(open),
        newProspects,
        journalEntries: lessons,
      };
    }
    case "get_products": {
      const p = await getPortfolio(tx);
      return {
        today,
        products: p.items.map((i) => ({
          id: i.product.id,
          name: i.product.name,
          stage: i.product.stage,
          status: i.product.status,
          currency: i.product.currency,
          recommendation: i.assessment.recommendation,
          confidence: i.assessment.confidence,
          reasons: i.assessment.reasons,
          mrr: i.latestMetrics?.mrr ?? null,
          mrrMonth: i.latestMetrics?.month ?? null,
          customers: i.latestMetrics?.activeCustomers ?? null,
          churnPct: pct(i.latestMetrics?.churnRate),
          profitLast3Months: i.recent3Months.profit,
          profitLifetime: i.lifetime.profit,
          demandLevel: i.demand ? `${i.demand.level}/5 ${i.demand.levelLabel}` : null,
          openCriticalBugs: i.openCriticalBugs,
        })),
      };
    }
    case "get_content": {
      const a = await getAnalytics(tx, { window: String(input.window) as "30" | "90" | "365" });
      const g = (x: (typeof a.byPillar)[number]) => ({ name: x.label, items: x.items, measured: x.measured, engagementPct: pct(x.engagementRate), trustSignalsPct: pct(x.trustRate), leadsPerItem: x.leadsPerItem == null ? null : Math.round(x.leadsPerItem * 10) / 10, prospects: x.prospects, wonDeals: x.wonDeals, smallSample: x.smallSample });
      return {
        window: a.window,
        totals: a.totals ? { items: a.totals.items, audience: a.totals.audience, engagementPct: pct(a.totals.engagementRate), trustSignalsPct: pct(a.totals.trustRate), reportedLeads: a.totals.reportedLeads, prospects: a.totals.prospects, wonDeals: a.totals.wonDeals, followersGained: a.totals.followersGained } : null,
        byPillar: a.byPillar.map(g),
        byFormat: a.byFormat.map(g),
        insights: a.insights,
      };
    }
    case "get_communication": {
      const c = await getCommunication(tx);
      return {
        skills: c.skills.map((s) => ({
          name: s.name,
          currentLevel: s.status.currentLevel,
          targetLevel: s.targetLevel,
          gap: s.status.gap,
          lastAssessedOn: s.status.lastAssessedOn,
          change: s.status.change,
          sessionsLast30Days: s.status.sessionsLast30,
          minutesLast30Days: s.status.minutesLast30,
          assessmentDue: s.status.assessmentDue,
        })),
      };
    }
    case "get_finance": {
      const f = await getFinance(tx);
      return {
        currency: f.settings.currency,
        savingsRateLastMonthPct: pct(f.summary.savingsRateLastMonth),
        savingsRate3MonthsPct: pct(f.summary.savingsRate3m),
        annualIncome: f.summary.annualIncome,
        annualBusinessProfit: f.summary.annualBusinessProfit,
        essentialMonthlyExpenses: f.summary.essentialMonthly,
        recurringBusinessIncome: f.recurringBusinessIncome,
        position: f.position,
        fi: { annualExpenses: f.fi.annualExpenses, source: f.fi.annualExpensesSource, withdrawalRatePct: f.settings.withdrawalRatePct, target: f.fi.target, progressPct: pct(f.fi.progress), projection: f.fi.projection ? { ...f.fi.projection, assumption: `${f.settings.expectedReturnPct}% yearly return, 3-month average saving` } : null },
        milestones: f.milestones.map((m) => ({ milestone: m.label, achievedOn: m.achievedOn, detail: m.detail })),
        monthsOfData: f.summary.monthsOfData,
      };
    }
    case "get_habits": {
      const h = await getHabitsOverview(tx);
      return {
        habits: h.items.map((i) => ({
          name: i.habit.name,
          weekPct: pct(i.week.rate),
          monthPct: pct(i.month.rate),
          last30Pct: pct(i.last30.rate),
          streak: `${i.streak.current} ${i.streak.unit} (best ${i.streak.best})`,
          missedLast90Days: i.missed.missedDays.length,
          hardestWeekday: i.missed.hardestDay,
        })),
        priorityCorrelations: h.correlations.map((c) => ({ habit: c.name, prioritiesDoneOnHabitDaysPct: pct(c.doneAvg), onOtherDaysPct: pct(c.otherAvg), habitDays: c.doneDays, otherDays: c.otherDays })),
        weeklyTrend: h.overall.map((w) => ({ weekStart: w.weekStart, pct: pct(w.rate) })),
      };
    }
    case "get_reviews": {
      const rows = await tx
        .select()
        .from(weekReviews)
        .where(isNotNull(weekReviews.completedAt))
        .orderBy(desc(weekReviews.weekStart))
        .limit(Number(input.count) || 4);
      return {
        reviews: rows.map((r) => {
          const s = (r.snapshot ?? {}) as { score?: number | null; observations?: { text: string }[] };
          return { weekStart: r.weekStart, score: s.score ?? null, observations: s.observations?.map((o) => o.text) ?? [], missedReasons: r.answers.missed.map((m) => m.reason), stopDoing: r.answers.stopDoing, continueDoing: r.answers.continueDoing, changeNextWeek: r.answers.changeNextWeek };
        }),
      };
    }
    case "get_learning": {
      const r = await getReading(tx);
      const p = await getPsychStats(tx);
      return {
        reading: { todayMinutes: r.stats.todayMinutes, dailyTarget: r.stats.target, streakDays: r.stats.streak, daysReadLast30: r.stats.daysRead30, yearGoal: r.progress },
        psychology: { conceptsLearned: p.learned, applied: p.appliedConcepts, understoodDeeply: p.understoodDeeply, needsStudy: p.needsStudy, dueToday: p.dueToday },
      };
    }
  }
  throw new Error(`Unknown tool ${name}`);
}

/** Records a proposal; validates that what it refers to exists for this user. */
async function runProposal(tx: Tx, name: string, input: Input, questionId: string | null) {
  const reason = String(input.reason ?? "").slice(0, 2000) || "No reason given.";
  const findGoal = async (id: unknown) => {
    const [g] = typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? await tx.select({ id: goals.id, title: goals.title, level: goals.level }).from(goals).where(eq(goals.id, id)).limit(1) : [];
    return g ?? null;
  };
  let row: { kind: (typeof advisorProposals.$inferInsert)["kind"]; payload: Record<string, unknown>; summary: string } | null = null;
  if (name === "propose_goal_change" || name === "propose_archive_goal") {
    const g = await findGoal(input.goalId);
    if (!g) return { error: "No goal with that id. Call get_overview or get_goals first." };
    if (name === "propose_archive_goal") row = { kind: "archive_goal", payload: { goalId: g.id }, summary: `Archive ${g.level.replace("_", "-")} goal "${g.title}"` };
    else {
      const changes = Object.fromEntries(["title", "targetValue", "targetDate", "priority", "status"].filter((k) => input[k] != null).map((k) => [k, input[k]]));
      if (!Object.keys(changes).length) return { error: "No change given." };
      row = { kind: "update_goal", payload: { goalId: g.id, changes }, summary: `Change "${g.title}": ${Object.entries(changes).map(([k, v]) => `${k} → ${v}`).join(", ")}` };
    }
  } else if (name === "propose_task") {
    const g = input.goalId ? await findGoal(input.goalId) : null;
    if (input.goalId && !g) return { error: "No goal with that id." };
    row = { kind: "create_task", payload: { title: String(input.title).slice(0, 300), goalId: g?.id ?? null, plannedWeek: input.plannedWeek ?? null }, summary: `Add task "${String(input.title).slice(0, 120)}"${g ? ` for "${g.title}"` : ""}` };
  } else if (name === "propose_delete_task") {
    const [t] = typeof input.taskId === "string" && /^[0-9a-f-]{36}$/i.test(input.taskId) ? await tx.select({ id: tasks.id, title: tasks.title }).from(tasks).where(eq(tasks.id, input.taskId)).limit(1) : [];
    if (!t) return { error: "No task with that id." };
    row = { kind: "delete_task", payload: { taskId: t.id }, summary: `Delete task "${t.title}"` };
  }
  if (!row) throw new Error(`Unknown tool ${name}`);
  const [p] = await tx.insert(advisorProposals).values({ ...row, reason, questionId }).returning({ id: advisorProposals.id });
  return { proposalId: p.id, status: "pending", note: "Shown to the user for confirmation. Nothing has changed." };
}

/** Executes one tool call for this user. Returns JSON text for the tool_result. */
export async function executeTool(userId: string, name: string, input: unknown, questionId: string | null, runAs: RunAs = withUser): Promise<{ output: string; isError: boolean }> {
  try {
    const args = (input ?? {}) as Input;
    const result = READ_NAMES.has(name) ? await readOnly(userId, (tx) => runRead(tx, name, args), runAs) : await runAs(userId, (tx) => runProposal(tx, name, args, questionId));
    const isError = typeof result === "object" && result !== null && "error" in result;
    return { output: JSON.stringify(result), isError };
  } catch (e) {
    return { output: JSON.stringify({ error: e instanceof Error ? e.message : "Tool failed" }), isError: true };
  }
}

