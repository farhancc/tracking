/**
 * Analytics across the whole system for a time range. Every number is
 * computed from recorded data; "planned" is only ever something you set (a
 * goal's pace, a target, a schedule, a forecast). Sections share one shape so
 * the page, the CSV and the PDF render the same figures.
 */
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import {
  audienceSnapshots,
  commAssessments,
  commPracticeSessions,
  commSkills,
  contentItems,
  contentMetrics,
  deals,
  financeAccounts,
  financeBalances,
  financeExpenses,
  financeForecasts,
  financeIncome,
  goalMeasurements,
  goals,
  habits,
  pillars,
  productFeatures,
  productMetrics,
  productReleases,
  products,
  productTransactions,
  salesActivities,
  salesTargets,
  salesTracks,
  tasks,
} from "@/db/schema";
import { getSettings, productMonths } from "@/features/finance/server/service";
import { requireWorkspace } from "@/features/goals/server/service";
import { loadContext, toDef } from "@/features/habits/server/service";
import {
  bucketsFor,
  childrenIndex,
  completionOn,
  firstOfMonth,
  inRange,
  judge,
  mean,
  prorate,
  ratio,
  resolveRange,
  type ActivityOutcome,
  type Bucket,
  type GoalHistory,
  type RangeKey,
  type ResolvedRange,
} from "@/lib/domain/analytics";
import { addDays, diffDays, maxDate, minDate, startOfWeek, type IsoDate } from "@/lib/domain/dates";
import { fiTarget, monthlyActuals, position, summary as financeSummary } from "@/lib/domain/finance";
import { completionPercent, expectedPercent, GOAL_HEALTH_LABELS, goalHealth } from "@/lib/domain/goals";
import { consistency } from "@/lib/domain/habits";
import { salesMetrics, type ActivityFact, type DealFact, type SalesMetric } from "@/lib/domain/sales";

export type Unit = "count" | "percent" | "currency" | "minutes" | "level";
export type Kpi = { label: string; actual: number | null; planned: number | null; unit: Unit; note?: string };
export type Series = { key: string; label: string; kind: "actual" | "planned"; type: "bar" | "line" };
export type Chart = { unit: Unit; series: Series[]; rows: ({ label: string } & Record<string, number | string | null>)[] };
export type Table = { columns: string[]; rows: (string | number | null)[][] };
export type Section = {
  id: string;
  title: string;
  question: string;
  currency: string | null;
  kpis: Kpi[];
  chart: Chart | null;
  table: Table | null;
  notes: string[];
  hasData: boolean;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const daysIn = (b: { start: IsoDate; end: IsoDate }) => diffDays(b.start, b.end) + 1;

/** Index of the bucket that holds a date; dates before the range go to the first bucket. */
function bucketOf(buckets: Bucket[], date: IsoDate | null | undefined): number {
  if (!date || !buckets.length || date > buckets.at(-1)!.end) return -1;
  if (date < buckets[0].start) return -1;
  return buckets.findIndex((b) => date >= b.start && date <= b.end);
}

export async function getAnalytics(tx: Tx, key: RangeKey) {
  const ws = await requireWorkspace(tx);
  const range = resolveRange(key, ws.today, ws.journey, ws.weekStartsOn);
  const ctx = { tx, ws, range, currency: ws.baseCurrency };

  const goalData = await loadGoals(tx, ws.journey.id);
  const sections: Section[] = [
    fiveYear(ctx, goalData),
    annual(ctx, goalData),
    quarterly(ctx, goalData),
    await weekly(ctx, goalData),
    await sales(ctx),
    await communication(ctx),
    await productRevenue(ctx),
    await customers(ctx),
    await content(ctx),
    await finance(ctx),
    await habitConsistency(ctx),
  ];
  const outcomes = await activityVsOutcome(ctx, goalData);
  return {
    range,
    today: ws.today,
    journey: { startDate: ws.journey.startDate, endDate: ws.journey.endDate },
    baseCurrency: ws.baseCurrency,
    sections,
    outcomes,
  };
}
export type AnalyticsReport = Awaited<ReturnType<typeof getAnalytics>>;

type Ctx = { tx: Tx; ws: Awaited<ReturnType<typeof requireWorkspace>>; range: ResolvedRange; currency: string };

// ---------------------------------------------------------------------------
// Goals

async function loadGoals(tx: Tx, journeyId: string) {
  const rows = await tx.select().from(goals).where(eq(goals.journeyId, journeyId));
  const ids = rows.map((g) => g.id);
  const ms = ids.length
    ? await tx
        .select({ goalId: goalMeasurements.goalId, measuredOn: goalMeasurements.measuredOn, value: goalMeasurements.value })
        .from(goalMeasurements)
        .where(inArray(goalMeasurements.goalId, ids))
        .orderBy(asc(goalMeasurements.measuredOn), asc(goalMeasurements.createdAt))
    : [];
  const histories: GoalHistory[] = rows.map((g) => ({
    id: g.id,
    parentId: g.parentId,
    isKeyResult: g.isKeyResult,
    measurementMode: g.measurementMode,
    baselineValue: g.baselineValue,
    targetValue: g.targetValue,
    archived: g.archivedAt !== null,
    measurements: ms.filter((m) => m.goalId === g.id).map((m) => ({ measuredOn: m.measuredOn, value: m.value })),
  }));
  const byId = new Map(histories.map((h) => [h.id, h]));
  const kids = childrenIndex(histories);
  const pillarRows = await tx.select({ id: pillars.id, name: pillars.name }).from(pillars);
  const pillarName = new Map(pillarRows.map((p) => [p.id, p.name]));
  const at = (id: string, date: IsoDate) => completionOn(byId.get(id)!, date, byId, kids);
  return { rows: rows.filter((g) => g.archivedAt === null), at, pillarName };
}
type GoalData = Awaited<ReturnType<typeof loadGoals>>;

function fiveYear({ range, ws }: Ctx, g: GoalData): Section {
  const list = g.rows.filter((x) => x.level === "five_year" && !x.isKeyResult);
  const journeyElapsed = expectedPercent({ startDate: ws.journey.startDate, targetDate: ws.journey.endDate }, ws.today);
  const rows = range.buckets.map((b) => ({
    label: b.label,
    actual: mean(list.map((x) => g.at(x.id, b.end))),
    planned: mean(list.map((x) => expectedPercent(x, b.end))),
  }));
  return {
    id: "five_year",
    title: "Five-year progress",
    question: "Are the five-year goals moving at the pace the journey needs?",
    currency: null,
    kpis: [
      { label: "Average outcome progress", actual: mean(list.map((x) => x.completionPct ?? completionPercent(x))), planned: mean(list.map((x) => expectedPercent(x, ws.today))), unit: "percent", note: "Planned = share of each goal's period elapsed (linear pace)." },
      { label: "Journey elapsed", actual: journeyElapsed, planned: null, unit: "percent" },
      { label: "Goals on track", actual: list.filter((x) => ["on_track", "achieved", "target_met"].includes(goalHealth(x, ws.today))).length, planned: list.length, unit: "count" },
    ],
    chart: list.length ? { unit: "percent", series: [{ key: "actual", label: "Actual progress", kind: "actual", type: "line" }, { key: "planned", label: "Planned pace", kind: "planned", type: "line" }], rows } : null,
    table: list.length
      ? {
          columns: ["Goal", "Pillar", "Actual %", "Planned %", "Health"],
          rows: list.map((x) => [x.title, g.pillarName.get(x.pillarId) ?? "", x.completionPct ?? completionPercent(x), expectedPercent(x, ws.today), GOAL_HEALTH_LABELS[goalHealth(x, ws.today)]]),
        }
      : null,
    notes: ["Progress is rebuilt for each date from the measurements you logged, so the line shows where each goal stood then."],
    hasData: list.length > 0,
  };
}

function annual({ range, ws }: Ctx, g: GoalData): Section {
  const list = g.rows.filter((x) => x.level === "annual" && !x.isKeyResult && x.startDate <= range.to && x.targetDate >= range.from);
  const years = [...new Set(list.map((x) => x.targetDate.slice(0, 4)))].sort();
  const rows = years.map((y) => {
    const inYear = list.filter((x) => x.targetDate.startsWith(y));
    return {
      label: y,
      planned: inYear.length,
      achieved: inYear.filter((x) => x.status === "achieved").length,
      open: inYear.filter((x) => !["achieved", "missed", "abandoned"].includes(x.status)).length,
      missed: inYear.filter((x) => x.status === "missed").length,
    };
  });
  return {
    id: "annual",
    title: "Annual objectives",
    question: "How many of the year's objectives were achieved?",
    currency: null,
    kpis: [
      { label: "Achieved", actual: sum(rows.map((r) => r.achieved)), planned: list.length, unit: "count" },
      { label: "Open and on pace", actual: list.filter((x) => goalHealth(x, ws.today) === "on_track").length, planned: sum(rows.map((r) => r.open)), unit: "count" },
      { label: "Missed", actual: sum(rows.map((r) => r.missed)), planned: null, unit: "count" },
    ],
    chart: rows.length ? { unit: "count", series: [{ key: "planned", label: "Objectives set", kind: "planned", type: "bar" }, { key: "achieved", label: "Achieved", kind: "actual", type: "bar" }], rows } : null,
    table: list.length
      ? { columns: ["Objective", "Year", "Status", "Actual %", "Planned %"], rows: list.map((x) => [x.title, x.targetDate.slice(0, 4), x.status, x.completionPct ?? completionPercent(x), expectedPercent(x, minDate(range.to, x.targetDate))]) }
      : null,
    notes: ["An objective counts as achieved only after you confirm it; a met target waiting for confirmation is still open."],
    hasData: list.length > 0,
  };
}

const quarterOf = (d: IsoDate) => `${d.slice(0, 4)} Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;

function quarterly({ range }: Ctx, g: GoalData): Section {
  const list = g.rows.filter((x) => x.level === "quarterly" && x.isKeyResult && x.startDate <= range.to && x.targetDate >= range.from);
  const quarters = [...new Set(list.map((x) => quarterOf(x.startDate)))].sort();
  const at = (x: (typeof list)[number]) => minDate(range.to, x.targetDate);
  const rows = quarters.map((q) => {
    const inQ = list.filter((x) => quarterOf(x.startDate) === q);
    return { label: q, actual: mean(inQ.map((x) => g.at(x.id, at(x)))), planned: mean(inQ.map((x) => expectedPercent(x, at(x)))) };
  });
  return {
    id: "quarterly",
    title: "Quarterly key results",
    question: "Are the quarters' key results being hit?",
    currency: null,
    kpis: [
      { label: "Average key-result progress", actual: mean(list.map((x) => g.at(x.id, at(x)))), planned: mean(list.map((x) => expectedPercent(x, at(x)))), unit: "percent" },
      { label: "Key results met", actual: list.filter((x) => g.at(x.id, at(x)) >= 100).length, planned: list.length, unit: "count" },
    ],
    chart: rows.length ? { unit: "percent", series: [{ key: "planned", label: "Planned pace", kind: "planned", type: "bar" }, { key: "actual", label: "Actual", kind: "actual", type: "bar" }], rows } : null,
    table: list.length ? { columns: ["Key result", "Quarter", "Actual %", "Planned %", "Status"], rows: list.map((x) => [x.title, quarterOf(x.startDate), g.at(x.id, at(x)), expectedPercent(x, at(x)), x.status]) } : null,
    notes: ["Values are as of the end of the range (or the key result's end date, if earlier)."],
    hasData: list.length > 0,
  };
}

async function weekly({ tx, range, ws }: Ctx, g: GoalData): Promise<Section> {
  const from = startOfWeek(range.from, ws.weekStartsOn);
  const rows = await tx
    .select({ status: tasks.status, plannedWeek: tasks.plannedWeek, scheduledOn: tasks.scheduledOn, isDeliverable: tasks.isDeliverable })
    .from(tasks)
    .where(and(isNull(tasks.archivedAt), gte(tasks.plannedWeek, from), lte(tasks.plannedWeek, range.to)));
  const byDay = range.unit === "day";
  const placed = rows
    .filter((t) => t.status !== "cancelled")
    .map((t) => ({ ...t, idx: bucketOf(range.buckets, byDay ? t.scheduledOn : maxDate(t.plannedWeek!, range.from)) }))
    .filter((t) => t.idx >= 0);
  const weekGoals = g.rows.filter((x) => x.level === "weekly" && !x.isKeyResult && inRange(x.startDate, from, range.to));
  const chartRows = range.buckets.map((b, i) => {
    const ts = placed.filter((t) => t.idx === i);
    return { label: b.label, planned: ts.length, done: ts.filter((t) => t.status === "done").length, rate: ratio(ts.filter((t) => t.status === "done").length, ts.length) };
  });
  const planned = placed.length;
  const done = placed.filter((t) => t.status === "done").length;
  const goalsMet = weekGoals.filter((x) => x.status === "achieved" || x.isTargetMet).length;
  return {
    id: "weekly",
    title: "Weekly completion",
    question: "How much of the planned work gets done each week?",
    currency: null,
    kpis: [
      { label: "Planned tasks done", actual: done, planned, unit: "count" },
      { label: "Completion rate", actual: ratio(done, planned), planned: 100, unit: "percent" },
      { label: "Weekly goals met", actual: goalsMet, planned: weekGoals.length, unit: "count", note: "Outcome: a weekly goal met, not tasks ticked." },
      { label: "Deliverables done", actual: placed.filter((t) => t.isDeliverable && t.status === "done").length, planned: placed.filter((t) => t.isDeliverable).length, unit: "count" },
    ],
    chart: planned ? { unit: "count", series: [{ key: "planned", label: "Planned tasks", kind: "planned", type: "bar" }, { key: "done", label: "Done", kind: "actual", type: "bar" }], rows: chartRows } : null,
    table: planned ? { columns: ["Period", "Planned", "Done", "Rate %"], rows: chartRows.map((r) => [r.label, r.planned, r.done, r.rate]) } : null,
    notes: [byDay ? "Days use the date a task was scheduled for." : "Tasks count in the week they were planned for; cancelled tasks are left out."],
    hasData: planned > 0 || weekGoals.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Sales

async function salesFacts(tx: Tx, from: IsoDate, to: IsoDate) {
  const acts = await tx.select().from(salesActivities).where(and(gte(salesActivities.occurredOn, from), lte(salesActivities.occurredOn, to)));
  const closed = await tx.select().from(deals).where(and(gte(deals.closedOn, from), lte(deals.closedOn, to), inArray(deals.stage, ["won", "lost"])));
  return { acts, closed };
}
const toActivity = (a: typeof salesActivities.$inferSelect): ActivityFact => ({ kind: a.kind, connected: a.connected, reachedDecisionMaker: a.reachedDecisionMaker, qualified: a.qualified, meetingBooked: a.meetingBooked }) as ActivityFact;
const toDeal = (d: typeof deals.$inferSelect): DealFact => ({ stage: d.stage, amount: d.amount, currency: d.currency });

async function sales({ tx, range, currency }: Ctx): Promise<Section> {
  const { acts, closed } = await salesFacts(tx, range.from, range.to);
  const tracks = await tx.select({ id: salesTracks.id, currency: salesTracks.currency }).from(salesTracks).where(isNull(salesTracks.archivedAt));
  const targets = tracks.length ? await tx.select().from(salesTargets).where(inArray(salesTargets.trackId, tracks.map((t) => t.id))) : [];
  /** Planned value of a metric for a bucket: each track's target in force at the bucket's end, prorated to its length. */
  const plannedFor = (metric: SalesMetric, b: { start: IsoDate; end: IsoDate }) => {
    let total: number | null = null;
    for (const t of tracks) {
      // A revenue target is in the track's currency; only same-currency targets add up.
      if (metric === "revenue" && t.currency !== currency) continue;
      const inForce = targets.filter((x) => x.trackId === t.id && x.metric === metric && x.effectiveFrom <= b.end).sort((a, c) => c.effectiveFrom.localeCompare(a.effectiveFrom));
      // Prefer the shortest period that has a target (a weekly target says more about a week than a quarterly one).
      const pick = (["day", "week", "month", "quarter"] as const).map((p) => inForce.find((x) => x.period === p)).find(Boolean);
      if (pick) total = (total ?? 0) + prorate(pick.targetValue, pick.period, daysIn(b));
    }
    return total;
  };
  const SHOWN: { metric: SalesMetric; label: string }[] = [
    { metric: "prospecting_attempts", label: "Prospecting attempts" },
    { metric: "cold_calls", label: "Cold calls" },
    { metric: "meetings_booked", label: "Meetings booked" },
    { metric: "deals_closed", label: "Deals won" },
  ];
  const perBucket = range.buckets.map((b) => ({
    b,
    m: salesMetrics(acts.filter((a) => inRange(a.occurredOn, b.start, b.end)).map(toActivity), closed.filter((d) => inRange(d.closedOn, b.start, b.end)).map(toDeal)).counts,
  }));
  const plannedTotal = (metric: SalesMetric) => {
    const xs = range.buckets.map((b) => plannedFor(metric, b));
    return xs.some((x) => x !== null) ? r1(sum(xs.map((x) => x ?? 0))) : null;
  };
  const total = salesMetrics(acts.map(toActivity), closed.map(toDeal));
  // Chart the activity metric you set a target for (cold calls or attempts), against that target.
  const lead: SalesMetric = plannedTotal("cold_calls") !== null && plannedTotal("prospecting_attempts") === null ? "cold_calls" : "prospecting_attempts";
  const leadLabel = SHOWN.find((x) => x.metric === lead)!.label;
  const rows = perBucket.map(({ b, m }) => ({
    label: b.label,
    activity: m[lead as Exclude<SalesMetric, "revenue">],
    activityPlanned: plannedFor(lead, b),
    attempts: m.prospecting_attempts,
    connected: m.calls_connected,
    meetings: m.meetings_booked,
    quotes: m.quotations_sent,
    won: m.deals_closed,
    revenue: r2(m.revenue[currency] ?? 0),
  }));
  const otherCurrencies = Object.entries(total.counts.revenue).filter(([c]) => c !== currency);
  const hasPlan = rows.some((r) => r.activityPlanned !== null);
  const any = acts.length > 0 || closed.length > 0;
  return {
    id: "sales",
    title: "Sales performance",
    question: "Is prospecting turning into meetings, deals and revenue?",
    currency,
    kpis: [
      ...SHOWN.map(({ metric, label }) => ({ label, actual: total.counts[metric as Exclude<SalesMetric, "revenue">], planned: plannedTotal(metric), unit: "count" as const })),
      { label: `Revenue won (${currency})`, actual: r2(total.counts.revenue[currency] ?? 0), planned: plannedTotal("revenue"), unit: "currency" },
      { label: "Closing rate", actual: total.rates.closingRate, planned: null, unit: "percent", note: "Deals won ÷ deals closed." },
    ],
    chart: any
      ? {
          unit: "count",
          series: [...(hasPlan ? [{ key: "activityPlanned", label: `${leadLabel} target`, kind: "planned" as const, type: "bar" as const }] : []), { key: "activity", label: leadLabel, kind: "actual", type: "bar" }],
          rows,
        }
      : null,
    table: any ? { columns: ["Period", "Attempts", "Connected", "Meetings", "Quotes", "Won", `Revenue ${currency}`], rows: rows.map((r) => [r.label, r.attempts, r.connected, r.meetings, r.quotes, r.won, r.revenue]) } : null,
    notes: [
      hasPlan || SHOWN.some((x) => plannedTotal(x.metric) !== null) ? "Planned figures are your sales targets, spread evenly over each period." : "No sales targets set, so there is nothing planned to compare against.",
      ...(otherCurrencies.length ? [`Revenue in other currencies is not converted: ${otherCurrencies.map(([c, v]) => `${c} ${r2(v)}`).join(", ")}.`] : []),
    ],
    hasData: any,
  };
}

// ---------------------------------------------------------------------------
// Communication

async function communication({ tx, range }: Ctx): Promise<Section> {
  const skills = await tx.select().from(commSkills).where(isNull(commSkills.archivedAt)).orderBy(asc(commSkills.sortOrder));
  const assessments = await tx.select().from(commAssessments).where(lte(commAssessments.assessedOn, range.to)).orderBy(asc(commAssessments.assessedOn), asc(commAssessments.createdAt));
  const sessions = await tx.select().from(commPracticeSessions).where(and(gte(commPracticeSessions.practicedOn, range.from), lte(commPracticeSessions.practicedOn, range.to)));
  const levelAt = (skillId: string, date: IsoDate) => assessments.filter((a) => a.skillId === skillId && a.assessedOn <= date).at(-1)?.level ?? null;
  const table = skills.map((s) => {
    const before = levelAt(s.id, addDays(range.from, -1));
    const firstIn = assessments.find((a) => a.skillId === s.id && a.assessedOn >= range.from)?.level ?? null;
    const start = before ?? firstIn;
    const end = levelAt(s.id, range.to);
    const ss = sessions.filter((x) => x.skillId === s.id);
    return { name: s.name, start, end, target: s.targetLevel, change: start !== null && end !== null ? end - start : null, sessions: ss.length, minutes: sum(ss.map((x) => x.durationMinutes ?? 0)) };
  });
  const rows = range.buckets.map((b) => {
    const ss = sessions.filter((x) => inRange(x.practicedOn, b.start, b.end));
    return { label: b.label, minutes: sum(ss.map((x) => x.durationMinutes ?? 0)), sessions: ss.length };
  });
  const assessedIn = assessments.filter((a) => a.assessedOn >= range.from).length;
  return {
    id: "communication",
    title: "Communication skills",
    question: "Is practice raising assessed skill levels?",
    currency: null,
    kpis: [
      { label: "Practice minutes", actual: sum(rows.map((r) => r.minutes)), planned: null, unit: "minutes" },
      { label: "Level points gained (all skills)", actual: sum(table.map((t) => t.change ?? 0)), planned: null, unit: "level" },
      { label: "Skills at target", actual: table.filter((t) => t.end !== null && t.end >= t.target).length, planned: skills.length, unit: "count" },
      { label: "Assessments in range", actual: assessedIn, planned: null, unit: "count" },
    ],
    chart: sessions.length ? { unit: "minutes", series: [{ key: "minutes", label: "Practice minutes", kind: "actual", type: "bar" }], rows } : null,
    table: skills.length ? { columns: ["Skill", "Level at start", "Level now", "Target", "Change", "Sessions", "Minutes"], rows: table.map((t) => [t.name, t.start, t.end, t.target, t.change, t.sessions, t.minutes]) } : null,
    notes: ["Levels come only from recorded assessments (1–10); practice alone never raises a level.", ...(assessedIn ? [] : ["No assessment in this range, so level change can't be judged."])],
    hasData: sessions.length > 0 || assessedIn > 0,
  };
}

// ---------------------------------------------------------------------------
// Products and customers

async function productList(tx: Tx, currency: string) {
  const list = await tx.select({ id: products.id, name: products.name, currency: products.currency }).from(products).where(isNull(products.archivedAt));
  return { same: list.filter((p) => p.currency === currency), other: list.filter((p) => p.currency !== currency) };
}

async function productRevenue({ tx, range, currency }: Ctx): Promise<Section> {
  const { same, other } = await productList(tx, currency);
  const ids = same.map((p) => p.id);
  const txs = ids.length ? await tx.select().from(productTransactions).where(and(inArray(productTransactions.productId, ids), gte(productTransactions.occurredOn, range.from), lte(productTransactions.occurredOn, range.to))) : [];
  const metrics = ids.length ? await tx.select().from(productMetrics).where(and(inArray(productMetrics.productId, ids), lte(productMetrics.month, range.to))).orderBy(asc(productMetrics.month)) : [];
  const mrrAt = (date: IsoDate) => {
    const latest = new Map<string, number>();
    for (const m of metrics) if (m.month <= date) latest.set(m.productId, m.mrr ?? 0);
    return r2(sum([...latest.values()]));
  };
  const net = (list: typeof txs) => r2(sum(list.filter((t) => t.kind === "revenue").map((t) => (t.category === "refund" ? -t.amount : t.amount))));
  const rows = range.buckets.map((b) => {
    const inB = txs.filter((t) => inRange(t.occurredOn, b.start, b.end));
    return { label: b.label, revenue: net(inB), expenses: r2(sum(inB.filter((t) => t.kind === "expense").map((t) => t.amount))), mrr: mrrAt(b.end) };
  });
  const revenue = net(txs);
  const expenses = r2(sum(txs.filter((t) => t.kind === "expense").map((t) => t.amount)));
  const mrrStart = mrrAt(addDays(range.from, -1));
  const mrrEnd = mrrAt(range.to);
  return {
    id: "product_revenue",
    title: "Product revenue",
    question: "Are the products growing revenue?",
    currency,
    kpis: [
      { label: `Net revenue (${currency})`, actual: revenue, planned: null, unit: "currency" },
      { label: `Product profit (${currency})`, actual: r2(revenue - expenses), planned: null, unit: "currency" },
      { label: `MRR at end (${currency})`, actual: mrrEnd, planned: null, unit: "currency", note: `MRR at start: ${mrrStart}.` },
    ],
    chart: txs.length || metrics.length ? { unit: "currency", series: [{ key: "revenue", label: "Net revenue", kind: "actual", type: "bar" }, { key: "mrr", label: "MRR (latest recorded)", kind: "actual", type: "line" }], rows } : null,
    table: txs.length || metrics.length ? { columns: ["Period", "Net revenue", "Expenses", "MRR"], rows: rows.map((r) => [r.label, r.revenue, r.expenses, r.mrr]) } : null,
    notes: [
      "No revenue plan is recorded for products, so only actuals are shown. Refunds are subtracted.",
      ...(other.length ? [`Not included (other currency): ${other.map((p) => `${p.name} (${p.currency})`).join(", ")}.`] : []),
    ],
    hasData: txs.length > 0 || metrics.length > 0,
  };
}

async function customers({ tx, range, currency }: Ctx): Promise<Section> {
  const { same, other } = await productList(tx, currency);
  const all = [...same, ...other];
  const months = bucketsFor(range.from, range.to, "month", 1);
  const metrics = all.length
    ? await tx.select().from(productMetrics).where(and(inArray(productMetrics.productId, all.map((p) => p.id)), gte(productMetrics.month, firstOfMonth(range.from)), lte(productMetrics.month, range.to)))
    : [];
  const won = await tx.select({ closedOn: deals.closedOn }).from(deals).where(and(inArray(deals.stage, ["won"]), gte(deals.closedOn, range.from), lte(deals.closedOn, range.to)));
  const rows = months.map((b) => {
    const ms = metrics.filter((m) => m.month === firstOfMonth(b.start));
    return {
      label: b.label,
      newCustomers: sum(ms.map((m) => m.newCustomers)),
      churned: sum(ms.map((m) => m.churnedCustomers)),
      active: ms.length ? sum(ms.map((m) => m.activeCustomers)) : null,
      dealsWon: won.filter((d) => inRange(d.closedOn, b.start, b.end)).length,
    };
  });
  const gained = sum(rows.map((r) => r.newCustomers));
  const churned = sum(rows.map((r) => r.churned));
  return {
    id: "customers",
    title: "Customer acquisition",
    question: "Are customers being won faster than they leave?",
    currency: null,
    kpis: [
      { label: "New product customers", actual: gained, planned: null, unit: "count" },
      { label: "Churned", actual: churned, planned: null, unit: "count" },
      { label: "Net customers", actual: gained - churned, planned: null, unit: "count" },
      { label: "Sales deals won", actual: won.length, planned: null, unit: "count" },
    ],
    chart: metrics.length || won.length ? { unit: "count", series: [{ key: "newCustomers", label: "New customers", kind: "actual", type: "bar" }, { key: "churned", label: "Churned", kind: "actual", type: "bar" }, { key: "dealsWon", label: "Deals won", kind: "actual", type: "bar" }], rows } : null,
    table: metrics.length || won.length ? { columns: ["Month", "New", "Churned", "Active at month end", "Deals won"], rows: rows.map((r) => [r.label, r.newCustomers, r.churned, r.active, r.dealsWon]) } : null,
    notes: ["Product customer figures are monthly, as you record them, so this section is always by month. A month only partly inside the range counts in full."],
    hasData: metrics.length > 0 || won.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Content

async function contentFacts(tx: Tx, from: IsoDate, to: IsoDate) {
  const items = await tx.select({ id: contentItems.id, scheduledOn: contentItems.scheduledOn, publishedOn: contentItems.publishedOn, status: contentItems.status }).from(contentItems).where(isNull(contentItems.archivedAt));
  const published = items.filter((i) => inRange(i.publishedOn, from, to));
  const metrics = published.length ? await tx.select().from(contentMetrics).where(inArray(contentMetrics.itemId, published.map((i) => i.id))).orderBy(asc(contentMetrics.capturedOn)) : [];
  const latest = new Map<string, typeof contentMetrics.$inferSelect>();
  for (const m of metrics) latest.set(m.itemId, m);
  return { items, published, latest };
}

async function content({ tx, range }: Ctx): Promise<Section> {
  const { items, published, latest } = await contentFacts(tx, range.from, range.to);
  const audience = await tx.select().from(audienceSnapshots).where(lte(audienceSnapshots.capturedOn, range.to)).orderBy(asc(audienceSnapshots.capturedOn));
  const followersAt = (date: IsoDate) => {
    const per = new Map<string, number>();
    for (const a of audience) if (a.capturedOn <= date) per.set(a.platform, a.followers);
    return per.size ? sum([...per.values()]) : null;
  };
  const rows = range.buckets.map((b) => ({
    label: b.label,
    planned: items.filter((i) => inRange(i.scheduledOn, b.start, b.end)).length,
    published: published.filter((i) => inRange(i.publishedOn, b.start, b.end)).length,
    followers: followersAt(b.end),
  }));
  const leads = sum(published.map((i) => latest.get(i.id)?.leads ?? 0));
  const startF = followersAt(addDays(range.from, -1));
  const endF = followersAt(range.to);
  return {
    id: "content",
    title: "Content growth",
    question: "Is publishing growing the audience and bringing leads?",
    currency: null,
    kpis: [
      { label: "Published", actual: published.length, planned: rows.reduce((a, r) => a + r.planned, 0), unit: "count", note: "Planned = items scheduled in the range." },
      { label: "Followers gained", actual: startF !== null && endF !== null ? endF - startF : null, planned: null, unit: "count" },
      { label: "Followers at end", actual: endF, planned: null, unit: "count" },
      { label: "Leads from content published in range", actual: leads, planned: null, unit: "count" },
    ],
    chart: published.length || rows.some((r) => r.planned) ? { unit: "count", series: [{ key: "planned", label: "Scheduled", kind: "planned", type: "bar" }, { key: "published", label: "Published", kind: "actual", type: "bar" }], rows } : null,
    table: published.length || audience.length ? { columns: ["Period", "Scheduled", "Published", "Followers at end"], rows: rows.map((r) => [r.label, r.planned, r.published, r.followers]) } : null,
    notes: ["Followers are the sum of the latest snapshot per platform; leads use each item's latest metrics snapshot."],
    hasData: published.length > 0 || audience.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Finance

async function finance({ tx, range }: Ctx): Promise<Section> {
  const settings = await getSettings(tx);
  const cur = settings.currency;
  const months = bucketsFor(range.from, range.to, "month", 1);
  const firstM = firstOfMonth(range.from);
  const income = await tx.select().from(financeIncome).where(and(gte(financeIncome.receivedOn, firstM), lte(financeIncome.receivedOn, range.to)));
  const expenses = await tx.select().from(financeExpenses).where(and(gte(financeExpenses.spentOn, firstM), lte(financeExpenses.spentOn, range.to)));
  const forecasts = await tx.select().from(financeForecasts).where(and(gte(financeForecasts.month, firstM), lte(financeForecasts.month, range.to)));
  const accounts = await tx.select().from(financeAccounts);
  const kindOf = new Map(accounts.map((a) => [a.id, a.kind]));
  const balances = (await tx.select().from(financeBalances).where(lte(financeBalances.asOf, range.to))).filter((b) => kindOf.has(b.accountId)).map((b) => ({ accountId: b.accountId, kind: kindOf.get(b.accountId)!, asOf: b.asOf, balance: b.balance }));
  const prod = await productMonths(tx, cur);
  const actual = monthlyActuals(months.map((b) => firstOfMonth(b.start)), income, expenses, prod.months);
  // FI target uses the same rule as the finance dashboard: your estimate, else the last three complete months × 12.
  const allIncome = await tx.select({ receivedOn: financeIncome.receivedOn, source: financeIncome.source, amount: financeIncome.amount, recurring: financeIncome.recurring }).from(financeIncome);
  const allExpenses = await tx.select({ spentOn: financeExpenses.spentOn, category: financeExpenses.category, amount: financeExpenses.amount, essential: financeExpenses.essential }).from(financeExpenses);
  const recent = bucketsFor(addDays(firstOfMonth(range.to), -92), addDays(firstOfMonth(range.to), -1), "month", 1).map((b) => firstOfMonth(b.start));
  const s = financeSummary(monthlyActuals(recent, allIncome, allExpenses, prod.months));
  const annualExpenses = settings.annualExpensesEstimate ?? (s.monthlyExpenses3m != null ? r2(s.monthlyExpenses3m * 12) : null);
  const target = fiTarget(annualExpenses, settings.withdrawalRatePct);
  const rows = months.map((b, i) => {
    const a = actual[i];
    const f = forecasts.filter((x) => x.month === firstOfMonth(b.start));
    const pos = position(balances, b.end);
    return {
      label: b.label,
      income: a.totalIncome,
      incomePlanned: f.length ? r2(sum(f.filter((x) => x.kind === "income").map((x) => x.amount))) : null,
      expenses: a.expenses,
      expensesPlanned: f.length ? r2(sum(f.filter((x) => x.kind === "expense").map((x) => x.amount))) : null,
      savingsRate: a.savingsRate === null ? null : r1(a.savingsRate * 100),
      netWorth: pos.asOf ? pos.netWorth : null,
      investable: pos.asOf ? pos.investable : null,
      fiProgress: target && pos.asOf ? r1(Math.min(1, pos.investable / target) * 100) : null,
    };
  });
  const end = position(balances, range.to);
  const start = position(balances, addDays(range.from, -1));
  const totalIncome = r2(sum(rows.map((r) => r.income)));
  const totalExpenses = r2(sum(rows.map((r) => r.expenses)));
  const planned = rows.some((r) => r.incomePlanned !== null);
  return {
    id: "finance",
    title: "Financial independence",
    question: "Are investable assets closing the gap to the FI target?",
    currency: cur,
    kpis: [
      { label: "FI progress", actual: target && end.asOf ? r1(Math.min(1, end.investable / target) * 100) : null, planned: null, unit: "percent", note: target ? `Target ${cur} ${target} = annual expenses ÷ ${settings.withdrawalRatePct}% (assumptions you set).` : "No FI target yet: add expenses or an annual estimate." },
      { label: `Investable change (${cur})`, actual: end.asOf ? r2(end.investable - (start.asOf ? start.investable : 0)) : null, planned: null, unit: "currency" },
      { label: `Income (${cur})`, actual: totalIncome, planned: planned ? r2(sum(rows.map((r) => r.incomePlanned ?? 0))) : null, unit: "currency", note: "Planned = your monthly forecasts." },
      { label: `Expenses (${cur})`, actual: totalExpenses, planned: planned ? r2(sum(rows.map((r) => r.expensesPlanned ?? 0))) : null, unit: "currency" },
      { label: "Savings rate", actual: totalIncome > 0 ? r1(((totalIncome - totalExpenses) / totalIncome) * 100) : null, planned: null, unit: "percent" },
    ],
    // Progress as a share of the target keeps one readable axis (the target itself can be many times the assets).
    chart: balances.length && target ? { unit: "percent", series: [{ key: "fiProgress", label: "Investable assets as % of FI target", kind: "actual", type: "line" }], rows } : null,
    table: income.length || expenses.length || balances.length
      ? { columns: ["Month", "Income", "Income forecast", "Expenses", "Expenses forecast", "Savings rate %", "Net worth", "Investable"], rows: rows.map((r) => [r.label, r.income, r.incomePlanned, r.expenses, r.expensesPlanned, r.savingsRate, r.netWorth, r.investable]) }
      : null,
    notes: ["Actuals and forecasts are kept in separate columns; a forecast is never counted as income.", "Monthly figures; a month only partly inside the range counts in full."],
    hasData: income.length > 0 || expenses.length > 0 || balances.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Habits

async function habitConsistency({ tx, range, ws }: Ctx): Promise<Section> {
  const list = await tx.select().from(habits).where(isNull(habits.archivedAt)).orderBy(asc(habits.sortOrder));
  const { ctxFor } = await loadContext(tx, list.map((h) => h.id), addDays(range.from, -7), ws.today, ws.weekStartsOn);
  const each = list.map((h) => ({ h, def: toDef(h), ctx: ctxFor(h.id) }));
  const rateOver = (from: IsoDate, to: IsoDate) => {
    let done = 0;
    let expected = 0;
    for (const e of each) {
      const c = consistency(e.def, from, to, e.ctx);
      done += c.done;
      expected += c.expected;
    }
    return { done, expected, rate: ratio(done, expected) };
  };
  const rows = range.buckets.map((b) => ({ label: b.label, consistency: rateOver(b.start, b.end).rate }));
  const total = rateOver(range.from, range.to);
  const perHabit = each.map((e) => {
    const c = consistency(e.def, range.from, range.to, e.ctx);
    return [e.h.name, c.done, c.expected, ratio(c.done, c.expected)] as (string | number | null)[];
  });
  return {
    id: "habits",
    title: "Habit consistency",
    question: "Are the daily habits holding?",
    currency: null,
    kpis: [{ label: "Consistency", actual: total.rate, planned: 100, unit: "percent", note: `${total.done} of ${total.expected} expected check-ins. Rest days are excused.` }],
    chart: total.expected ? { unit: "percent", series: [{ key: "consistency", label: "Consistency", kind: "actual", type: "line" }], rows } : null,
    table: list.length ? { columns: ["Habit", "Done", "Expected", "Consistency %"], rows: perHabit } : null,
    notes: ["Habits are activity, not outcomes: they matter only if the outcome sections above move."],
    hasData: total.expected > 0,
  };
}

// ---------------------------------------------------------------------------
// Activity vs outcomes

async function activityVsOutcome({ tx, range }: Ctx, g: GoalData) {
  const p = range.previous;
  const fiveYear = g.rows.filter((x) => x.level === "five_year" && !x.isKeyResult);
  const progressGain = (from: IsoDate, to: IsoDate) => (fiveYear.length ? r1(mean(fiveYear.map((x) => g.at(x.id, to) - g.at(x.id, addDays(from, -1))))!) : 0);
  const tasksDone = async (from: IsoDate, to: IsoDate) =>
    (await tx.select({ completedAt: tasks.completedAt }).from(tasks).where(and(inArray(tasks.status, ["done"]), gte(tasks.completedAt, new Date(`${from}T00:00:00Z`)), lte(tasks.completedAt, new Date(`${addDays(to, 1)}T00:00:00Z`))))).length;

  const salesNow = await salesFacts(tx, range.from, range.to);
  const salesPrev = await salesFacts(tx, p.from, p.to);
  const sm = (f: typeof salesNow) => salesMetrics(f.acts.map(toActivity), f.closed.map(toDeal)).counts;
  const sNow = sm(salesNow);
  const sPrev = sm(salesPrev);

  const contentNow = await contentFacts(tx, range.from, range.to);
  const contentPrev = await contentFacts(tx, p.from, p.to);
  const leads = (c: typeof contentNow) => sum(c.published.map((i) => c.latest.get(i.id)?.leads ?? 0));

  const practice = async (from: IsoDate, to: IsoDate) => sum((await tx.select({ m: commPracticeSessions.durationMinutes }).from(commPracticeSessions).where(and(gte(commPracticeSessions.practicedOn, from), lte(commPracticeSessions.practicedOn, to)))).map((r) => r.m ?? 0));
  const assessments = await tx.select().from(commAssessments).orderBy(asc(commAssessments.assessedOn), asc(commAssessments.createdAt));
  const levelGain = (from: IsoDate, to: IsoDate) => {
    let gain = 0;
    for (const id of new Set(assessments.map((a) => a.skillId))) {
      const before = assessments.filter((a) => a.skillId === id && a.assessedOn < from).at(-1)?.level;
      const end = assessments.filter((a) => a.skillId === id && a.assessedOn <= to).at(-1)?.level;
      if (before !== undefined && end !== undefined) gain += end - before;
    }
    return gain;
  };

  const shipped = async (from: IsoDate, to: IsoDate) =>
    (await tx.select({ id: productFeatures.id }).from(productFeatures).where(and(gte(productFeatures.shippedOn, from), lte(productFeatures.shippedOn, to)))).length +
    (await tx.select({ id: productReleases.id }).from(productReleases).where(and(gte(productReleases.releasedOn, from), lte(productReleases.releasedOn, to)))).length;
  const newCustomers = async (from: IsoDate, to: IsoDate) => sum((await tx.select({ n: productMetrics.newCustomers }).from(productMetrics).where(and(gte(productMetrics.month, firstOfMonth(from)), lte(productMetrics.month, to)))).map((r) => r.n));

  const pairs: ActivityOutcome[] = [
    { area: "Execution", activityLabel: "Tasks completed", activity: await tasksDone(range.from, range.to), previousActivity: await tasksDone(p.from, p.to), outcomeLabel: "Five-year progress gained (points)", outcome: progressGain(range.from, range.to), previousOutcome: progressGain(p.from, p.to) },
    { area: "Sales", activityLabel: "Prospecting attempts + follow-ups", activity: sNow.prospecting_attempts + sNow.follow_ups, previousActivity: sPrev.prospecting_attempts + sPrev.follow_ups, outcomeLabel: "Meetings booked", outcome: sNow.meetings_booked, previousOutcome: sPrev.meetings_booked },
    { area: "Sales", activityLabel: "Quotations sent", activity: sNow.quotations_sent, previousActivity: sPrev.quotations_sent, outcomeLabel: "Deals won", outcome: sNow.deals_closed, previousOutcome: sPrev.deals_closed },
    { area: "Content", activityLabel: "Pieces published", activity: contentNow.published.length, previousActivity: contentPrev.published.length, outcomeLabel: "Leads from those pieces", outcome: leads(contentNow), previousOutcome: leads(contentPrev) },
    { area: "Communication", activityLabel: "Practice minutes", activity: await practice(range.from, range.to), previousActivity: await practice(p.from, p.to), outcomeLabel: "Assessed level points gained", outcome: levelGain(range.from, range.to), previousOutcome: levelGain(p.from, p.to) },
    { area: "Products", activityLabel: "Features shipped + releases", activity: await shipped(range.from, range.to), previousActivity: await shipped(p.from, p.to), outcomeLabel: "New customers", outcome: await newCustomers(range.from, range.to), previousOutcome: await newCustomers(p.from, p.to) },
  ];
  return {
    previous: p,
    pairs: pairs.map((x) => ({ ...x, ...judge(x) })),
    caveat: "Each line compares outcome per unit of activity with the previous period of the same length. It shows whether effort and results move together; it doesn't prove one caused the other, and some outcomes lag their activity.",
  };
}
