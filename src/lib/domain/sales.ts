/**
 * Sales mastery: pure metrics and period maths.
 *
 * Counts come from the activity log and deals; rates are ratios of those
 * counts and are what the trend views emphasise (performance, not volume).
 */
import { addDays, addMonths, type IsoDate } from "./dates";
import { weekOf } from "./weekly";

export const ACTIVITY_KINDS = ["prospecting", "cold_call", "follow_up", "meeting", "quotation"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  prospecting: "Prospecting attempt",
  cold_call: "Cold call",
  follow_up: "Follow-up",
  meeting: "Meeting",
  quotation: "Quotation sent",
};

export const CHANNELS = ["phone", "email", "linkedin", "whatsapp", "in_person", "other"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = {
  phone: "Phone",
  email: "Email",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  in_person: "In person",
  other: "Other",
};

/** One-tap call outcomes; each step implies the ones before it. */
export const CALL_OUTCOMES = ["no_answer", "connected", "decision_maker", "qualified", "meeting_booked"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  no_answer: "No answer",
  connected: "Connected",
  decision_maker: "Decision-maker",
  qualified: "Qualified",
  meeting_booked: "Meeting booked",
};
export function outcomeFlags(outcome: CallOutcome) {
  const i = CALL_OUTCOMES.indexOf(outcome);
  return { connected: i >= 1, reachedDecisionMaker: i >= 2, qualified: i >= 3, meetingBooked: i >= 4 };
}

export const PROSPECT_STATUSES = ["new", "contacted", "connected", "qualified", "meeting", "proposal", "won", "lost", "nurture", "disqualified"] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];
export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  new: "New",
  contacted: "Contacted",
  connected: "Connected",
  qualified: "Qualified",
  meeting: "Meeting",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
  nurture: "Nurture",
  disqualified: "Disqualified",
};
const FUNNEL_ORDER: ProspectStatus[] = ["new", "contacted", "connected", "qualified", "meeting", "proposal", "won"];
/** Status changes from activity only move forward through the funnel (never out of won/lost/nurture/disqualified). */
export function advanceProspectStatus(current: ProspectStatus, reached: ProspectStatus): ProspectStatus {
  const a = FUNNEL_ORDER.indexOf(current);
  const b = FUNNEL_ORDER.indexOf(reached);
  if (a === -1 || b === -1) return current;
  return b > a ? reached : current;
}

export const DEAL_STAGES = ["qualified", "meeting", "proposal", "negotiation", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  qualified: "Qualified",
  meeting: "Meeting",
  proposal: "Proposal sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};
export const OPEN_DEAL_STAGES: DealStage[] = ["qualified", "meeting", "proposal", "negotiation"];

export const JOURNAL_KINDS = ["objection", "successful_response", "rejected_prospect", "successful_conversation", "mistake", "lesson"] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];
export const JOURNAL_KIND_LABELS: Record<JournalKind, string> = {
  objection: "Difficult objection",
  successful_response: "Successful response",
  rejected_prospect: "Rejected prospect",
  successful_conversation: "Successful conversation",
  mistake: "Mistake",
  lesson: "Lesson learned",
};

export const SALES_METRICS = [
  "prospecting_attempts",
  "cold_calls",
  "calls_connected",
  "decision_makers_reached",
  "qualified_leads",
  "follow_ups",
  "meetings_booked",
  "quotations_sent",
  "deals_closed",
  "revenue",
  "lost_deals",
] as const;
export type SalesMetric = (typeof SALES_METRICS)[number];
export const SALES_METRIC_LABELS: Record<SalesMetric, string> = {
  prospecting_attempts: "Prospecting attempts",
  cold_calls: "Cold calls",
  calls_connected: "Calls connected",
  decision_makers_reached: "Decision-makers reached",
  qualified_leads: "Qualified leads",
  follow_ups: "Follow-ups",
  meetings_booked: "Meetings booked",
  quotations_sent: "Quotations sent",
  deals_closed: "Deals closed (won)",
  revenue: "Revenue generated",
  lost_deals: "Lost deals",
};
/** Metrics where fewer is better (targets act as ceilings). */
export const LOWER_IS_BETTER: SalesMetric[] = ["lost_deals"];

export const SALES_PERIODS = ["day", "week", "month", "quarter"] as const;
export type SalesPeriod = (typeof SALES_PERIODS)[number];
export const SALES_PERIOD_LABELS: Record<SalesPeriod, string> = { day: "Day", week: "Week", month: "Month", quarter: "Quarter" };

export type Range = { start: IsoDate; end: IsoDate };

export function periodRange(period: SalesPeriod, anchor: IsoDate, weekStartsOn: number): Range {
  switch (period) {
    case "day":
      return { start: anchor, end: anchor };
    case "week": {
      const w = weekOf(anchor, weekStartsOn);
      return { start: w.weekStart, end: w.weekEnd };
    }
    case "month": {
      const start = `${anchor.slice(0, 7)}-01`;
      return { start, end: addDays(addMonths(start, 1), -1) };
    }
    case "quarter": {
      const m = Number(anchor.slice(5, 7));
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      const start = `${anchor.slice(0, 4)}-${String(qStart).padStart(2, "0")}-01`;
      return { start, end: addDays(addMonths(start, 3), -1) };
    }
  }
}

/** The range `offset` periods before (negative) or after (positive) the given one. */
export function shiftPeriod(period: SalesPeriod, range: Range, offset: number, weekStartsOn: number): Range {
  const anchor =
    period === "day"
      ? addDays(range.start, offset)
      : period === "week"
        ? addDays(range.start, offset * 7)
        : addMonths(range.start, offset * (period === "month" ? 1 : 3));
  return periodRange(period, anchor, weekStartsOn);
}

export function periodLabel(period: SalesPeriod, range: Range): string {
  if (period === "day") return range.start;
  if (period === "week") return `Week of ${range.start}`;
  if (period === "month") return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${range.start}T00:00:00Z`));
  return `Q${Math.floor((Number(range.start.slice(5, 7)) - 1) / 3) + 1} ${range.start.slice(0, 4)}`;
}

export type ActivityFact = {
  kind: ActivityKind;
  connected: boolean;
  reachedDecisionMaker: boolean;
  qualified: boolean;
  meetingBooked: boolean;
};
export type DealFact = { stage: DealStage; amount: number | null; currency: string };

export type SalesCounts = Record<Exclude<SalesMetric, "revenue">, number> & { revenue: Record<string, number> };

export type SalesRates = {
  connectionRate: number | null;
  qualificationRate: number | null;
  meetingConversionRate: number | null;
  proposalConversionRate: number | null;
  closingRate: number | null;
  followUpEffectiveness: number | null;
  averageDealValue: Record<string, number>;
  revenuePerProspect: Record<string, number>;
};

export const RATE_LABELS: Record<Exclude<keyof SalesRates, "averageDealValue" | "revenuePerProspect">, { label: string; formula: string }> = {
  connectionRate: { label: "Connection rate", formula: "Calls connected ÷ cold calls" },
  qualificationRate: { label: "Qualification rate", formula: "Qualified leads ÷ decision-makers reached" },
  meetingConversionRate: { label: "Meeting conversion", formula: "Meetings booked ÷ qualified leads" },
  proposalConversionRate: { label: "Proposal conversion", formula: "Deals won ÷ quotations sent" },
  closingRate: { label: "Closing rate", formula: "Deals won ÷ deals closed (won + lost)" },
  followUpEffectiveness: { label: "Follow-up effectiveness", formula: "Follow-ups that got a response ÷ follow-ups" },
};

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/**
 * `activities` are those that happened in the period; `closedDeals` are deals
 * won or lost in the period (by close date).
 */
export function salesMetrics(activities: ActivityFact[], closedDeals: DealFact[]): { counts: SalesCounts; rates: SalesRates } {
  const calls = activities.filter((a) => a.kind === "cold_call");
  const followUps = activities.filter((a) => a.kind === "follow_up");
  const won = closedDeals.filter((d) => d.stage === "won");
  const lost = closedDeals.filter((d) => d.stage === "lost");
  const revenue: Record<string, number> = {};
  for (const d of won) revenue[d.currency] = (revenue[d.currency] ?? 0) + (d.amount ?? 0);
  const wonByCurrency: Record<string, number> = {};
  for (const d of won) wonByCurrency[d.currency] = (wonByCurrency[d.currency] ?? 0) + 1;

  const counts: SalesCounts = {
    prospecting_attempts: activities.filter((a) => a.kind === "prospecting" || a.kind === "cold_call").length,
    cold_calls: calls.length,
    calls_connected: calls.filter((a) => a.connected).length,
    decision_makers_reached: activities.filter((a) => a.reachedDecisionMaker).length,
    qualified_leads: activities.filter((a) => a.qualified).length,
    follow_ups: followUps.length,
    meetings_booked: activities.filter((a) => a.meetingBooked).length,
    quotations_sent: activities.filter((a) => a.kind === "quotation").length,
    deals_closed: won.length,
    revenue,
    lost_deals: lost.length,
  };

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const rates: SalesRates = {
    connectionRate: pct(counts.calls_connected, counts.cold_calls),
    qualificationRate: pct(counts.qualified_leads, counts.decision_makers_reached),
    meetingConversionRate: pct(counts.meetings_booked, counts.qualified_leads),
    proposalConversionRate: pct(counts.deals_closed, counts.quotations_sent),
    closingRate: pct(won.length, won.length + lost.length),
    followUpEffectiveness: pct(followUps.filter((a) => a.connected || a.meetingBooked || a.qualified).length, followUps.length),
    averageDealValue: Object.fromEntries(Object.entries(revenue).map(([c, v]) => [c, round2(v / wonByCurrency[c])])),
    revenuePerProspect:
      counts.prospecting_attempts > 0
        ? Object.fromEntries(Object.entries(revenue).map(([c, v]) => [c, round2(v / counts.prospecting_attempts)]))
        : {},
  };
  return { counts, rates };
}

/** Change in percentage points (rates) or relative change (counts), for "vs previous period". */
export function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10) / 10;
}

export function targetAttainment(metric: SalesMetric, actual: number, target: number | null): number | null {
  if (target === null || target <= 0) return null;
  if (LOWER_IS_BETTER.includes(metric)) return actual <= target ? 100 : Math.round((target / actual) * 100);
  return Math.min(100, Math.round((actual / target) * 100));
}
