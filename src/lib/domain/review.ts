/**
 * Weekly review and accountability: the twelve questions, a cross-pillar
 * report from tracked data, direct observations, recurring patterns and
 * suggested goals for next week. Observations always quote the numbers they
 * come from; nothing here is generic encouragement.
 */
import type { IsoDate } from "./dates";

export const MISS_REASONS = ["underestimated", "interrupted", "priorities_changed", "low_energy", "blocked", "avoided", "too_ambitious", "unclear", "other"] as const;
export type MissReason = (typeof MISS_REASONS)[number];
export const MISS_REASON_LABELS: Record<MissReason, string> = {
  underestimated: "Took longer than estimated",
  interrupted: "Interruptions or urgent work",
  priorities_changed: "Priorities changed",
  low_energy: "Low energy or ill",
  blocked: "Waiting on someone else",
  avoided: "Avoided or procrastinated",
  too_ambitious: "Target was too ambitious",
  unclear: "Goal was unclear",
  other: "Other",
};

/** The twelve questions; the first three are answered from tracked data. */
export const REVIEW_QUESTIONS = [
  { key: "planned", label: "What were my planned goals?", fromData: true },
  { key: "completed", label: "What did I actually complete?", fromData: true },
  { key: "missed", label: "Which goals were missed?", fromData: true },
  { key: "whyMissed", label: "Why did I miss them?", fromData: false },
  { key: "biggestAchievement", label: "What was my biggest achievement?", fromData: false },
  { key: "learned", label: "What did I learn?", fromData: false },
  { key: "revenue", label: "What generated revenue?", fromData: false },
  { key: "interest", label: "What generated customer interest?", fromData: false },
  { key: "wastedTime", label: "What wasted my time?", fromData: false },
  { key: "stopDoing", label: "What should I stop doing?", fromData: false },
  { key: "continueDoing", label: "What should I continue doing?", fromData: false },
  { key: "changeNextWeek", label: "What should I change next week?", fromData: false },
] as const;

export type ReviewAnswers = {
  missed: { goalId: string; reason: MissReason; note: string | null }[];
  completedNotes: string | null;
  biggestAchievement: string | null;
  learned: string | null;
  revenue: string | null;
  interest: string | null;
  wastedTime: string | null;
  stopDoing: string | null;
  continueDoing: string | null;
  changeNextWeek: string | null;
};

export type Money = Record<string, number>;
export const addMoney = (a: Money, currency: string, amount: number) => {
  a[currency] = Math.round(((a[currency] ?? 0) + amount) * 100) / 100;
  return a;
};
const moneyText = (m: Money, fmt: (n: number, c: string) => string) =>
  Object.entries(m)
    .filter(([, v]) => v)
    .map(([c, v]) => fmt(v, c))
    .join(" + ");

/** Everything tracked in the week, gathered across modules. */
export type WeekSignals = {
  goals: { id: string; title: string; pillarKey: string | null; area: string | null; met: boolean; completionPct: number | null; parentId: string | null; parentActive: boolean; successMetric: string; unit: string; targetValue: number; baselineValue: number; measurementMode: string }[];
  deliverables: { planned: number; delivered: number; titles: string[] };
  time: { actualMinutes: number; deliverableMinutes: number; routineMinutes: number; estimateRatio: number | null; capacityMinutes: number | null };
  carried: { carriedIn: number; chronic: { title: string; carryCount: number }[] };
  mits: { set: number; done: number; daysWithMits: number };
  habits: { rate: number | null; done: number; expected: number; weakest: { name: string; rate: number } | null; previousRate: number | null };
  sales: { activities: number; calls: number; connected: number; meetings: number; newProspects: number; prospectsFromContent: number; dealsWon: number; wonByCurrency: Money; practiceSessions: number; practiceMinutes: number; psychReviews: number };
  product: { revenueByCurrency: Money; interviews: number; committed: number; feedback: number; featuresShipped: number; releases: number; stepsValidated: number };
  brand: { published: number; titles: string[]; attributedProspects: number };
  wealth: { incomeByCurrency: Money; incomeBySource: Record<string, number>; expenses: number; currency: string | null };
  learning: { readingMinutes: number; completed: string[] };
  /** Pillars that have an active annual, quarterly or monthly objective. */
  activePillars: string[];
};

export type Observation = { pillar: string | null; tone: "good" | "neutral" | "concern"; text: string };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const h = (min: number) => `${Math.round((min / 60) * 10) / 10}h`;

export function observations(s: WeekSignals, fmt: (n: number, c: string) => string): Observation[] {
  const out: Observation[] = [];
  const planned = s.goals.length;
  const met = s.goals.filter((g) => g.met).length;
  if (planned) out.push({ pillar: null, tone: met === planned ? "good" : met / planned < 0.5 ? "concern" : "neutral", text: `Met ${met} of ${planned} weekly goal(s) (${pct(met / planned)}).` });
  else out.push({ pillar: null, tone: "concern", text: "No weekly goals were planned, so there was no outcome to measure the week against." });

  if (s.deliverables.planned) {
    out.push({ pillar: null, tone: s.deliverables.delivered === s.deliverables.planned ? "good" : "neutral", text: `Delivered ${s.deliverables.delivered} of ${s.deliverables.planned} planned deliverable(s).` });
  }
  if (s.time.actualMinutes >= 60) {
    const share = s.time.routineMinutes / s.time.actualMinutes;
    out.push({
      pillar: null,
      tone: share > 0.6 ? "concern" : "neutral",
      text: `${h(s.time.actualMinutes)} logged on tasks; ${pct(share)} of it on routine tasks that aren't deliverables.`,
    });
  }
  if (s.time.estimateRatio != null && s.time.estimateRatio >= 1.3) out.push({ pillar: null, tone: "concern", text: `Finished tasks took ${s.time.estimateRatio.toFixed(1)}× their estimates.` });
  if (s.carried.chronic.length) {
    const top = [...s.carried.chronic].sort((a, b) => b.carryCount - a.carryCount)[0];
    out.push({ pillar: null, tone: "concern", text: `${s.carried.chronic.length} task(s) have been carried forward twice or more; "${top.title}" ${top.carryCount} times.` });
  }
  if (s.mits.daysWithMits) {
    out.push({ pillar: null, tone: s.mits.done / s.mits.set >= 0.8 ? "good" : "neutral", text: `Top priorities set on ${s.mits.daysWithMits} day(s); ${s.mits.done} of ${s.mits.set} done.` });
  }
  if (s.habits.rate != null) {
    const delta = s.habits.previousRate != null ? Math.round((s.habits.rate - s.habits.previousRate) * 100) : null;
    out.push({
      pillar: null,
      tone: s.habits.rate >= 0.8 ? "good" : s.habits.rate < 0.5 ? "concern" : "neutral",
      text: `Habit consistency ${pct(s.habits.rate)}${delta != null && delta !== 0 ? ` (${delta > 0 ? "up" : "down"} ${Math.abs(delta)} points on last week)` : ""}${s.habits.weakest ? `; weakest: ${s.habits.weakest.name} at ${pct(s.habits.weakest.rate)}` : ""}.`,
    });
  }

  // Sales mastery
  const sa = s.sales;
  if (sa.activities || sa.dealsWon || sa.newProspects) {
    const conv = sa.calls ? `, ${sa.connected} connected (${pct(sa.connected / sa.calls)})` : "";
    out.push({
      pillar: "sales",
      tone: sa.dealsWon ? "good" : sa.meetings ? "neutral" : "concern",
      text: `${sa.activities} sales activities${conv}, ${sa.meetings} meeting(s) booked, ${sa.newProspects} new prospect(s)${sa.dealsWon ? `, ${sa.dealsWon} deal(s) won (${moneyText(sa.wonByCurrency, fmt)})` : ", no deals won"}.`,
    });
  }
  if (sa.practiceSessions) out.push({ pillar: "sales", tone: "neutral", text: `${sa.practiceSessions} communication practice session(s), ${sa.practiceMinutes} min.` });
  // Product entrepreneurship
  const pr = s.product;
  const prodRevenue = moneyText(pr.revenueByCurrency, fmt);
  if (prodRevenue || pr.interviews || pr.feedback || pr.featuresShipped) {
    out.push({
      pillar: "product",
      tone: pr.committed || prodRevenue ? "good" : pr.featuresShipped && !pr.interviews && !pr.feedback ? "concern" : "neutral",
      text: `Product: ${prodRevenue ? `${prodRevenue} revenue` : "no revenue"}, ${pr.interviews} interview(s)${pr.committed ? ` (${pr.committed} committed to pay)` : ""}, ${pr.feedback} feedback item(s), ${pr.featuresShipped} feature(s) shipped.`,
    });
    if (pr.featuresShipped >= 2 && !pr.interviews && !pr.feedback) {
      out.push({ pillar: "product", tone: "concern", text: `Shipped ${pr.featuresShipped} features without a single customer conversation logged.` });
    }
  }
  // Personal branding
  if (s.brand.published || s.brand.attributedProspects) {
    out.push({
      pillar: "brand",
      tone: s.brand.attributedProspects ? "good" : "neutral",
      text: `Published ${s.brand.published} piece(s) of content; ${s.brand.attributedProspects} prospect(s) this week came from content.`,
    });
  }
  // Financial independence
  const income = moneyText(s.wealth.incomeByCurrency, fmt);
  if (income || s.wealth.expenses) {
    out.push({ pillar: "wealth", tone: "neutral", text: `Recorded income ${income || "none"}; spending ${s.wealth.currency ? fmt(s.wealth.expenses, s.wealth.currency) : s.wealth.expenses}.` });
  }
  // Pillars with active objectives but nothing tracked this week.
  const touched = new Set<string>([
    ...s.goals.map((g) => g.pillarKey).filter((x): x is string => !!x),
    ...(sa.activities || sa.dealsWon || sa.practiceSessions ? ["sales"] : []),
    ...(prodRevenue || pr.interviews || pr.featuresShipped || pr.feedback ? ["product"] : []),
    ...(s.brand.published ? ["brand"] : []),
    ...(income ? ["wealth"] : []),
  ]);
  for (const p of s.activePillars) {
    if (!touched.has(p)) out.push({ pillar: p, tone: "concern", text: "Active objectives here, but no weekly goal or tracked activity this week." });
  }
  return out;
}

export type PastReview = {
  weekStart: IsoDate;
  score: number | null;
  answers: ReviewAnswers;
  missedAreas: string[];
  estimateRatio: number | null;
  pillarsWithoutGoals: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Patterns across recent reviews (most recent first). Each needs at least 3 occurrences. */
export function recurringPatterns(reviews: PastReview[], pillarNames: Record<string, string>): string[] {
  const out: string[] = [];
  const n = reviews.length;
  if (n < 2) return out;
  const reasons = new Map<MissReason, number>();
  for (const r of reviews) for (const reason of new Set(r.answers.missed.map((m) => m.reason))) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  for (const [reason, count] of reasons) if (count >= 3) out.push(`"${MISS_REASON_LABELS[reason]}" was a reason for missed goals in ${count} of the last ${n} weeks.`);
  const areas = new Map<string, number>();
  for (const r of reviews) for (const a of new Set(r.missedAreas)) areas.set(a, (areas.get(a) ?? 0) + 1);
  for (const [area, count] of areas) if (count >= 3) out.push(`A ${area} goal was missed in ${count} of the last ${n} weeks.`);
  const over = reviews.filter((r) => r.estimateRatio != null && r.estimateRatio >= 1.3).length;
  if (over >= 3) out.push(`Tasks overran their estimates by 30% or more in ${over} of the last ${n} weeks: estimate higher or plan less.`);
  const neglected = new Map<string, number>();
  for (const r of reviews) for (const p of r.pillarsWithoutGoals) neglected.set(p, (neglected.get(p) ?? 0) + 1);
  for (const [p, count] of neglected) if (count >= 3) out.push(`${pillarNames[p] ?? p} had no weekly goal in ${count} of the last ${n} weeks.`);
  const stops = new Map<string, { text: string; count: number }>();
  for (const r of reviews) {
    const s = r.answers.stopDoing?.trim();
    if (!s) continue;
    const k = norm(s);
    const cur = stops.get(k) ?? { text: s, count: 0 };
    cur.count += 1;
    stops.set(k, cur);
  }
  for (const { text, count } of stops.values()) if (count >= 2) out.push(`You've written "${text}" under "stop doing" in ${count} reviews. It hasn't stopped yet.`);
  const scores = reviews.map((r) => r.score).filter((x): x is number => x != null);
  if (scores.length >= 3 && scores[0] < scores[1] && scores[1] < scores[2]) out.push(`The weekly score has fallen three weeks running (${scores[2]} → ${scores[1]} → ${scores[0]}).`);
  return out;
}

export type GoalSuggestion = {
  key: string;
  kind: "retry" | "smaller" | "pillar_gap";
  reason: string;
  title: string;
  focusArea: string;
  parentId: string | null;
  successMetric: string;
  unit: string;
  measurementMode: string;
  baselineValue: number;
  targetValue: number;
};

/** Suggestions for next week; nothing is created until you approve (and can edit) each one. */
export function suggestGoals(
  s: WeekSignals,
  answers: ReviewAnswers,
  pillarObjectives: { pillarKey: string; pillarName: string; objectiveId: string; objectiveTitle: string; area: string }[],
): GoalSuggestion[] {
  const out: GoalSuggestion[] = [];
  const reasonOf = new Map(answers.missed.map((m) => [m.goalId, m.reason]));
  for (const g of s.goals.filter((x) => !x.met && x.parentActive && x.parentId)) {
    const reason = reasonOf.get(g.id);
    if (reason === "priorities_changed") continue;
    const smaller = reason === "too_ambitious" || reason === "underestimated";
    const target = smaller ? Math.max(g.baselineValue + (g.targetValue - g.baselineValue) / 2, g.baselineValue + 1) : g.targetValue;
    out.push({
      key: `${smaller ? "smaller" : "retry"}-${g.id}`,
      kind: smaller ? "smaller" : "retry",
      reason: smaller
        ? `Missed (${MISS_REASON_LABELS[reason!].toLowerCase()}); suggested at half the target.`
        : `Missed this week (${g.completionPct ?? 0}% complete)${reason ? `: ${MISS_REASON_LABELS[reason].toLowerCase()}` : ""}.`,
      title: g.title,
      focusArea: g.area ?? "personal",
      parentId: g.parentId,
      successMetric: g.successMetric,
      unit: g.unit,
      measurementMode: g.measurementMode,
      baselineValue: g.baselineValue,
      targetValue: Math.round(target * 100) / 100,
    });
  }
  const withGoals = new Set(s.goals.map((g) => g.pillarKey));
  for (const p of pillarObjectives) {
    if (withGoals.has(p.pillarKey) || out.some((x) => x.parentId === p.objectiveId)) continue;
    out.push({
      key: `gap-${p.objectiveId}`,
      kind: "pillar_gap",
      reason: `${p.pillarName} had no weekly goal; "${p.objectiveTitle}" is still open.`,
      title: `Move "${p.objectiveTitle}" forward`,
      focusArea: p.area,
      parentId: p.objectiveId,
      successMetric: "Measurable step completed",
      unit: "count",
      measurementMode: "cumulative",
      baselineValue: 0,
      targetValue: 1,
    });
  }
  return out;
}
