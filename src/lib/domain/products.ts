/**
 * Software product portfolio: stages, finance reports, churn, and a
 * transparent, rule-based investment recommendation computed only from
 * recorded actuals. Nothing here estimates or invents a figure.
 */
import { addMonths, type IsoDate } from "./dates";

export const PRODUCT_STAGES = ["idea", "research", "validation", "mvp", "beta", "launch", "growth", "optimization"] as const;
export type ProductStage = (typeof PRODUCT_STAGES)[number];
export const PRODUCT_STAGE_LABELS: Record<ProductStage, string> = {
  idea: "Idea",
  research: "Research",
  validation: "Validation",
  mvp: "MVP",
  beta: "Beta",
  launch: "Launch",
  growth: "Growth",
  optimization: "Optimization",
};
/** Stages at which the product is on sale and judged on revenue and retention. */
export const LAUNCHED_STAGES: readonly ProductStage[] = ["launch", "growth", "optimization"];
export const isLaunchedStage = (s: ProductStage) => LAUNCHED_STAGES.includes(s);

export const PRODUCT_STATUSES = ["active", "paused", "discontinued"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const BUSINESS_MODELS = ["subscription", "one_time", "usage_based", "freemium", "marketplace", "services", "advertising", "other"] as const;
export type BusinessModel = (typeof BUSINESS_MODELS)[number];
export const BUSINESS_MODEL_LABELS: Record<BusinessModel, string> = {
  subscription: "Subscription (SaaS)",
  one_time: "One-time purchase",
  usage_based: "Usage-based",
  freemium: "Freemium",
  marketplace: "Marketplace / commission",
  services: "Services / implementation",
  advertising: "Advertising",
  other: "Other",
};

export const TRANSACTION_KINDS = ["revenue", "expense"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];
export const REVENUE_CATEGORIES = ["subscription", "one_time", "services", "refund", "other_revenue"] as const;
export const EXPENSE_CATEGORIES = ["hosting", "software", "marketing", "contractors", "payment_fees", "legal", "hardware", "other_expense"] as const;
export const TRANSACTION_CATEGORIES = [...REVENUE_CATEGORIES, ...EXPENSE_CATEGORIES] as const;
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];
export const TRANSACTION_CATEGORY_LABELS: Record<TransactionCategory, string> = {
  subscription: "Subscriptions",
  one_time: "One-time sales",
  services: "Services",
  refund: "Refunds (subtracted)",
  other_revenue: "Other revenue",
  hosting: "Hosting & infrastructure",
  software: "Software & tools",
  marketing: "Marketing & ads",
  contractors: "Contractors",
  payment_fees: "Payment fees",
  legal: "Legal & accounting",
  hardware: "Hardware",
  other_expense: "Other expense",
};
export const categoryKind = (c: TransactionCategory): TransactionKind =>
  (REVENUE_CATEGORIES as readonly string[]).includes(c) ? "revenue" : "expense";

export const MILESTONE_STATUSES = ["open", "done", "dropped"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const FEATURE_STATUSES = ["backlog", "planned", "in_progress", "shipped", "dropped"] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];
export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  backlog: "Backlog",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  dropped: "Dropped",
};
export const FEATURE_PRIORITIES = ["must", "should", "could", "wont"] as const;
export type FeaturePriority = (typeof FEATURE_PRIORITIES)[number];
export const FEATURE_PRIORITY_LABELS: Record<FeaturePriority, string> = { must: "Must", should: "Should", could: "Could", wont: "Won't (now)" };

export const FEEDBACK_KINDS = ["praise", "complaint", "feature_request", "bug_report", "question", "churn_reason"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  praise: "Praise",
  complaint: "Complaint",
  feature_request: "Feature request",
  bug_report: "Bug report",
  question: "Question",
  churn_reason: "Reason for leaving",
};
export const FEEDBACK_SOURCES = ["interview", "call", "email", "support", "in_app", "review", "social", "other"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];
export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const BUG_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type BugSeverity = (typeof BUG_SEVERITIES)[number];
export const BUG_STATUSES = ["open", "in_progress", "fixed", "wont_fix"] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];
export const OPEN_BUG_STATUSES: readonly BugStatus[] = ["open", "in_progress"];

// ---------------------------------------------------------------------------
// Months

/** "2026-11-17" → "2026-11-01". */
export const monthOf = (d: IsoDate): IsoDate => `${d.slice(0, 7)}-01`;

/** Inclusive list of month starts. */
export function monthRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let m = monthOf(from); m <= monthOf(to) && out.length < 600; m = addMonths(m, 1)) out.push(m);
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Finance report

export type TransactionInput = { occurredOn: IsoDate; category: TransactionCategory; amount: number };

export type MonthFinance = {
  month: IsoDate;
  revenue: number;
  refunds: number;
  netRevenue: number;
  expenses: number;
  profit: number;
  cumulativeProfit: number;
  byCategory: Partial<Record<TransactionCategory, number>>;
};

export type FinanceTotals = { revenue: number; refunds: number; netRevenue: number; expenses: number; profit: number };

export function sumFinance(txns: TransactionInput[]): FinanceTotals {
  let revenue = 0;
  let refunds = 0;
  let expenses = 0;
  for (const t of txns) {
    if (t.category === "refund") refunds += t.amount;
    else if (categoryKind(t.category) === "revenue") revenue += t.amount;
    else expenses += t.amount;
  }
  const netRevenue = revenue - refunds;
  return { revenue: round2(revenue), refunds: round2(refunds), netRevenue: round2(netRevenue), expenses: round2(expenses), profit: round2(netRevenue - expenses) };
}

/** Month-by-month revenue, expenses and profit, including empty months. */
export function monthlyFinance(txns: TransactionInput[], from: IsoDate, to: IsoDate): MonthFinance[] {
  const byMonth = new Map<IsoDate, TransactionInput[]>();
  for (const t of txns) {
    const m = monthOf(t.occurredOn);
    byMonth.set(m, [...(byMonth.get(m) ?? []), t]);
  }
  let cumulative = 0;
  // Profit before the window still counts towards the running total.
  for (const t of txns) {
    if (monthOf(t.occurredOn) < monthOf(from)) cumulative += signed(t);
  }
  return monthRange(from, to).map((month) => {
    const list = byMonth.get(month) ?? [];
    const totals = sumFinance(list);
    const byCategory: Partial<Record<TransactionCategory, number>> = {};
    for (const t of list) byCategory[t.category] = round2((byCategory[t.category] ?? 0) + t.amount);
    cumulative += totals.profit;
    return { month, ...totals, byCategory, cumulativeProfit: round2(cumulative) };
  });
}

const signed = (t: TransactionInput) => (t.category === "refund" || categoryKind(t.category) === "expense" ? -t.amount : t.amount);

// ---------------------------------------------------------------------------
// Customer metrics

export type MonthlyMetric = { month: IsoDate; mrr: number | null; activeCustomers: number; newCustomers: number; churnedCustomers: number };

/** Customers at the start of the month = end − new + churned. */
export const startCustomers = (m: MonthlyMetric) => Math.max(0, m.activeCustomers - m.newCustomers + m.churnedCustomers);

/** Monthly logo churn as a fraction (0.05 = 5%), or null with no customers at the start. */
export function churnRate(m: MonthlyMetric): number | null {
  const start = startCustomers(m);
  if (start === 0) return null;
  return Math.min(1, m.churnedCustomers / start);
}

/** Month-over-month MRR growth rates for consecutive months with MRR recorded. */
export function mrrGrowthRates(metrics: MonthlyMetric[]): number[] {
  const sorted = [...metrics].sort((a, b) => a.month.localeCompare(b.month));
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (addMonths(prev.month, 1) !== cur.month || prev.mrr == null || cur.mrr == null || prev.mrr <= 0) continue;
    out.push((cur.mrr - prev.mrr) / prev.mrr);
  }
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ---------------------------------------------------------------------------
// Investment recommendation

export const RECOMMENDATIONS = ["invest", "maintain", "fix_retention", "validate", "pause", "discontinue", "insufficient_data", "paused", "discontinued"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  invest: "Invest more",
  maintain: "Maintain",
  fix_retention: "Fix retention first",
  validate: "Validate before building more",
  pause: "Consider pausing",
  discontinue: "Consider discontinuing",
  insufficient_data: "Not enough data",
  paused: "Paused",
  discontinued: "Discontinued",
};

/** Thresholds are deliberately simple and documented in docs/15. */
export const THRESHOLDS = {
  investGrowth: 0.05, // ≥5% average monthly MRR growth
  highChurn: 0.08, // >8% average monthly logo churn
  staleStageMonths: 6, // months in a pre-launch stage without customer evidence
  minLaunchedMonths: 2, // months of metrics needed to judge a launched product
  discontinueAfterMonths: 6, // launched this long, shrinking and losing money
} as const;

export type AssessmentInput = {
  stage: ProductStage;
  status: ProductStatus;
  today: IsoDate;
  stageEnteredOn: IsoDate;
  launchedOn: IsoDate | null;
  /** Recorded monthly metrics, any order. */
  metrics: MonthlyMetric[];
  /** Finance for the last three complete months. */
  recentFinance: FinanceTotals;
  feedbackLast90: number;
  openCriticalBugs: number;
  /** For wording only. */
  currency?: string;
  /** Validation evidence (Prompt 10); null when not tracked. */
  validation?: { validatedMilestones: number; interviews: number; willingToPay: number; level?: number } | null;
};

export type Assessment = {
  recommendation: Recommendation;
  confidence: "low" | "medium" | "high";
  reasons: string[];
  signals: {
    mrr: number | null;
    mrrMonth: IsoDate | null;
    avgGrowth: number | null;
    avgChurn: number | null;
    recentProfit: number;
    monthsOfData: number;
  };
};

export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const a = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7));
  const b = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  return b - a - (Number(to.slice(8, 10)) < Number(from.slice(8, 10)) ? 1 : 0);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function assessProduct(input: AssessmentInput): Assessment {
  const sorted = [...input.metrics].sort((a, b) => a.month.localeCompare(b.month));
  const recent = sorted.slice(-3);
  const latest = sorted.at(-1) ?? null;
  const growth = avg(mrrGrowthRates(sorted.slice(-4)));
  const churns = recent.map(churnRate).filter((c): c is number => c != null);
  const avgChurn = avg(churns);
  const signals: Assessment["signals"] = {
    mrr: latest?.mrr ?? null,
    mrrMonth: latest?.month ?? null,
    avgGrowth: growth,
    avgChurn,
    recentProfit: input.recentFinance.profit,
    monthsOfData: sorted.length,
  };
  const confidence: Assessment["confidence"] = sorted.length >= 6 ? "high" : sorted.length >= 3 ? "medium" : "low";
  const out = (recommendation: Recommendation, reasons: string[], c = confidence): Assessment => ({ recommendation, confidence: c, reasons, signals });

  if (input.status === "paused") return out("paused", ["You paused this product."], "high");
  if (input.status === "discontinued") return out("discontinued", ["You discontinued this product."], "high");

  const bugNote = input.openCriticalBugs > 0 ? [`${input.openCriticalBugs} critical bug(s) open.`] : [];

  if (!isLaunchedStage(input.stage)) {
    const monthsInStage = monthsBetween(input.stageEnteredOn, input.today);
    const v = input.validation;
    const hasEvidence = input.feedbackLast90 > 0 || (v != null && (v.interviews > 0 || v.validatedMilestones > 0));
    if (monthsInStage >= THRESHOLDS.staleStageMonths && !hasEvidence) {
      return out(
        "pause",
        [`${monthsInStage} months in ${PRODUCT_STAGE_LABELS[input.stage]} with no customer feedback or interviews in the last 90 days.`, "Talk to customers or pause it."],
        "medium",
      );
    }
    if (v?.level != null && v.level >= 3) {
      return out(
        "invest",
        [`Not launched yet, but ${v.willingToPay} customer(s) committed or paid: demand is evidenced. Build what they committed to and deliver it.`, ...bugNote],
        "medium",
      );
    }
    const reasons = ["Not launched yet, so it is judged on validation evidence, not revenue."];
    if (v) reasons.push(`${v.validatedMilestones} validation milestone(s) with evidence, ${v.interviews} interview(s), ${v.willingToPay} willing to pay.`);
    else reasons.push(`${input.feedbackLast90} piece(s) of customer feedback in the last 90 days.`);
    if (v && v.willingToPay === 0) reasons.push("No one has said they would pay yet. Find that before building more.");
    return out("validate", [...reasons, ...bugNote], "medium");
  }

  if (sorted.length < THRESHOLDS.minLaunchedMonths) {
    return out("insufficient_data", [`Record at least ${THRESHOLDS.minLaunchedMonths} months of MRR and customers to get a recommendation (${sorted.length} so far).`], "low");
  }

  const growthText = growth == null ? "MRR growth unknown" : `MRR growth ${pct(growth)}/month`;
  const churnText = avgChurn == null ? "churn unknown" : `churn ${pct(avgChurn)}/month`;
  const profitText = `last 3 months profit ${input.currency ? formatMoney(input.recentFinance.profit, input.currency) : input.recentFinance.profit.toFixed(2)}`;
  const facts = `${growthText}, ${churnText}, ${profitText}.`;

  const monthsLaunched = input.launchedOn ? monthsBetween(input.launchedOn, input.today) : 0;
  const declining = growth != null && recent.length >= 3 && mrrGrowthRates(recent).length >= 2 && mrrGrowthRates(recent).every((g) => g < 0);
  if (declining && input.recentFinance.profit < 0 && monthsLaunched >= THRESHOLDS.discontinueAfterMonths) {
    return out("discontinue", [facts, "MRR fell every recent month while losing money, more than 6 months after launch."]);
  }
  if (avgChurn != null && avgChurn > THRESHOLDS.highChurn) {
    return out("fix_retention", [facts, `Churn above ${pct(THRESHOLDS.highChurn)}: more acquisition would leak out. Fix retention first.`, ...bugNote]);
  }
  if (growth != null && growth <= 0 && input.recentFinance.profit < 0) {
    return out("pause", [facts, "Not growing and losing money."]);
  }
  if (growth != null && growth >= THRESHOLDS.investGrowth) {
    return out("invest", [facts, `Growing at least ${pct(THRESHOLDS.investGrowth)} a month with churn under control.`, ...bugNote]);
  }
  const note =
    growth != null && growth < 0
      ? "MRR is shrinking but the product still pays for itself. Find out why before it turns."
      : input.recentFinance.profit >= 0
        ? "Stable and paying for itself."
        : "Growing slowly and not yet profitable.";
  return out("maintain", [facts, note, ...bugNote]);
}

export function formatMoney(amount: number | null | undefined, currency: string, opts: { compact?: boolean } = {}): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: opts.compact || Math.abs(amount) >= 1000 ? 0 : 2,
    notation: opts.compact && Math.abs(amount) >= 10_000 ? "compact" : "standard",
  }).format(amount);
}

export const formatPct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
