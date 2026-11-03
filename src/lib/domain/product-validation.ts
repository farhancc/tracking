/**
 * Product validation: the 12-step path from problem discovery to retention,
 * evidence per step, a customer interview log, and a demand-evidence ladder
 * computed from what customers did, never from time spent building.
 */
import type { IsoDate } from "./dates";
import { churnRate, type MonthlyMetric, type ProductStage, PRODUCT_STAGES } from "./products";

export const VALIDATION_STEPS = [
  "problem_discovery",
  "customer_interviews",
  "competitor_research",
  "market_validation",
  "landing_page",
  "presales",
  "mvp_development",
  "beta_testing",
  "customer_feedback",
  "public_launch",
  "customer_acquisition",
  "retention",
] as const;
export type ValidationStep = (typeof VALIDATION_STEPS)[number];

export const VALIDATION_STEP_META: Record<ValidationStep, { label: string; criteria: string }> = {
  problem_discovery: { label: "Problem discovery", criteria: "A specific customer, a specific painful problem, and how often it happens, written in their words." },
  customer_interviews: { label: "Customer interviews", criteria: "At least 10 interviews with target customers; most confirm the problem unprompted." },
  competitor_research: { label: "Competitor research", criteria: "Main alternatives (including spreadsheets and doing nothing), their prices, and why customers would switch." },
  market_validation: { label: "Market validation", criteria: "Enough reachable customers who pay for alternatives today; a price they accept." },
  landing_page: { label: "Landing page", criteria: "A page with the offer and price; conversion from targeted visitors to sign-ups measured." },
  presales: { label: "Pre-sales or pilot customers", criteria: "At least 3 customers commit before the product exists: pre-order, deposit, letter of intent or paid pilot." },
  mvp_development: { label: "MVP development", criteria: "The smallest version that delivers the core promise to the committed customers." },
  beta_testing: { label: "Beta testing", criteria: "Committed customers use it on real work; critical issues found and fixed." },
  customer_feedback: { label: "Customer feedback", criteria: "Structured feedback from beta users; the top requests and complaints are known." },
  public_launch: { label: "Public launch", criteria: "Available to buy publicly with a working payment flow." },
  customer_acquisition: { label: "Customer acquisition", criteria: "At least one repeatable channel with known cost per customer." },
  retention: { label: "Retention", criteria: "Customers keep paying: monthly churn below 8% for 3 months." },
};

export const STEP_STATUSES = ["not_started", "in_progress", "validated", "invalidated"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  validated: "Validated",
  invalidated: "Invalidated",
};

export const EVIDENCE_KINDS = ["observation", "interview_summary", "document", "metric", "visitors", "signups", "payment", "survey", "experiment"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  observation: "Observation",
  interview_summary: "Interview summary",
  document: "Document or link",
  metric: "Metric",
  visitors: "Landing page visitors (count)",
  signups: "Sign-ups (count)",
  payment: "Pre-sale or pilot payment (amount)",
  survey: "Survey result",
  experiment: "Experiment",
};
/** Evidence kinds whose value is required. */
export const VALUE_KINDS: readonly EvidenceKind[] = ["metric", "visitors", "signups", "payment"];

/** Ordered from weakest to strongest. Only commitments count as willingness to pay. */
export const WILLINGNESS = ["none", "unclear", "would_consider", "verbal_yes", "committed", "paid"] as const;
export type Willingness = (typeof WILLINGNESS)[number];
export const WILLINGNESS_LABELS: Record<Willingness, string> = {
  none: "Would not pay",
  unclear: "Unclear",
  would_consider: "Would consider it",
  verbal_yes: "Said yes (no commitment)",
  committed: "Committed: pre-order, deposit or letter of intent",
  paid: "Paid",
};
export const COMMITTED: readonly Willingness[] = ["committed", "paid"];

export const DEMAND = {
  minInterviews: 10,
  earlyInterviews: 5,
  confirmRate: 0.6,
  minCommitted: 3,
  minPayingCustomers: 3,
  retentionChurn: 0.08,
  retentionMonths: 3,
} as const;

export const DEMAND_LEVELS = [
  "No evidence yet",
  "Problem heard",
  "Problem confirmed",
  "Willingness to pay",
  "Paying customers",
  "Retained customers",
] as const;

export type DemandInput = {
  stage: ProductStage;
  interviews: { confirmsProblem: boolean | null; willingness: Willingness; statedPrice: number | null }[];
  evidence: { step: ValidationStep; kind: EvidenceKind; value: number | null }[];
  steps: { step: ValidationStep; status: StepStatus }[];
  metrics: MonthlyMetric[];
};

export type DemandCriterion = { level: number; label: string; met: boolean; detail: string };

export type DemandEvidence = {
  level: number;
  levelLabel: (typeof DEMAND_LEVELS)[number];
  criteria: DemandCriterion[];
  interviews: number;
  confirmProblem: number;
  confirmRate: number | null;
  committed: number;
  verbalYes: number;
  medianStatedPrice: number | null;
  landing: { visitors: number; signups: number; conversion: number | null };
  presales: { count: number; amount: number };
  validatedSteps: number;
  invalidatedSteps: number;
  nextStep: ValidationStep | null;
  warnings: string[];
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const stageIndex = (s: ProductStage) => PRODUCT_STAGES.indexOf(s);

export function demandEvidence(input: DemandInput): DemandEvidence {
  const interviews = input.interviews.length;
  const answered = input.interviews.filter((i) => i.confirmsProblem != null);
  const confirmProblem = answered.filter((i) => i.confirmsProblem).length;
  const confirmRate = answered.length ? confirmProblem / answered.length : null;
  const committed = input.interviews.filter((i) => COMMITTED.includes(i.willingness)).length;
  const verbalYes = input.interviews.filter((i) => i.willingness === "verbal_yes").length;
  const medianStatedPrice = median(input.interviews.map((i) => i.statedPrice).filter((p): p is number => p != null && p > 0));

  const sum = (kind: EvidenceKind) => input.evidence.filter((e) => e.kind === kind).reduce((a, e) => a + (e.value ?? 0), 0);
  const visitors = sum("visitors");
  const signups = sum("signups");
  const payments = input.evidence.filter((e) => e.kind === "payment" && (e.value ?? 0) > 0);
  const presales = { count: payments.length, amount: Math.round(payments.reduce((a, e) => a + (e.value ?? 0), 0) * 100) / 100 };

  const sorted = [...input.metrics].sort((a, b) => a.month.localeCompare(b.month));
  const lastChurn = sorted.slice(-DEMAND.retentionMonths).map(churnRate);
  const latestCustomers = sorted.at(-1)?.activeCustomers ?? 0;
  const payingCustomers = Math.max(presales.count, latestCustomers);
  const retained = lastChurn.length === DEMAND.retentionMonths && lastChurn.every((c) => c != null && c < DEMAND.retentionChurn);

  const criteria: DemandCriterion[] = [
    {
      level: 1,
      label: DEMAND_LEVELS[1],
      met: interviews >= DEMAND.earlyInterviews && (confirmRate ?? 0) >= DEMAND.confirmRate,
      detail: `${interviews} interview(s)${confirmRate == null ? "" : `, ${pct(confirmRate)} confirm the problem`}; needs ${DEMAND.earlyInterviews}+ with ${pct(DEMAND.confirmRate)}+ confirming.`,
    },
    {
      level: 2,
      label: DEMAND_LEVELS[2],
      met: interviews >= DEMAND.minInterviews && (confirmRate ?? 0) >= DEMAND.confirmRate,
      detail: `Needs ${DEMAND.minInterviews}+ interviews with ${pct(DEMAND.confirmRate)}+ confirming.`,
    },
    {
      level: 3,
      label: DEMAND_LEVELS[3],
      met: committed + presales.count >= DEMAND.minCommitted,
      detail: `${committed} committed or paid in interviews, ${presales.count} pre-sale payment(s); needs ${DEMAND.minCommitted}. ${verbalYes} verbal "yes" don't count.`,
    },
    {
      level: 4,
      label: DEMAND_LEVELS[4],
      met: payingCustomers >= DEMAND.minPayingCustomers,
      detail: `${payingCustomers} paying customer(s) (pre-sales or recorded active customers); needs ${DEMAND.minPayingCustomers}.`,
    },
    {
      level: 5,
      label: DEMAND_LEVELS[5],
      met: retained,
      detail: `Monthly churn below ${pct(DEMAND.retentionChurn)} for ${DEMAND.retentionMonths} recorded months${lastChurn.length ? ` (last: ${lastChurn.map((c) => (c == null ? "—" : pct(c))).join(", ")})` : ""}.`,
    },
  ];
  let level = 0;
  for (const c of criteria) {
    if (!c.met) break;
    level = c.level;
  }

  const status = new Map(input.steps.map((s) => [s.step, s.status]));
  const nextStep = VALIDATION_STEPS.find((s) => status.get(s) !== "validated") ?? null;

  const warnings: string[] = [];
  if (stageIndex(input.stage) >= stageIndex("mvp") && level < 3) {
    warnings.push("You are building before anyone has committed to pay. Get pre-orders, deposits or a paid pilot before adding more features.");
  }
  if (verbalYes >= 3 && committed === 0) {
    warnings.push(`${verbalYes} people said they'd pay but none committed. Ask for a deposit or letter of intent to test it.`);
  }
  if (status.get("customer_interviews") === "validated" && interviews < DEMAND.minInterviews) {
    warnings.push(`"Customer interviews" is marked validated with only ${interviews} logged interview(s).`);
  }

  return {
    level,
    levelLabel: DEMAND_LEVELS[level],
    criteria,
    interviews,
    confirmProblem,
    confirmRate,
    committed,
    verbalYes,
    medianStatedPrice,
    landing: { visitors, signups, conversion: visitors > 0 ? signups / visitors : null },
    presales,
    validatedSteps: input.steps.filter((s) => s.status === "validated").length,
    invalidatedSteps: input.steps.filter((s) => s.status === "invalidated").length,
    nextStep,
    warnings,
  };
}

/** Entering MVP or later from a pre-MVP stage needs demand evidence or an explicit acknowledgement. */
export function needsValidationGate(from: ProductStage, to: ProductStage, demandLevel: number): boolean {
  return stageIndex(from) < stageIndex("mvp") && stageIndex(to) >= stageIndex("mvp") && demandLevel < 3;
}

export const followUpDue = (i: { followUpOn: IsoDate | null; followUpDone: boolean }, today: IsoDate) => !!i.followUpOn && !i.followUpDone && i.followUpOn <= today;
