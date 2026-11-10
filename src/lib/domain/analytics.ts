/**
 * Analytics: pure rules for time ranges, buckets, rebuilding goal progress at
 * a past date, prorating targets, and judging whether activity is turning
 * into outcomes. No I/O.
 *
 * Actuals always come from recorded data. "Planned" means something you set:
 * a goal's linear pace, a sales target, a scheduled content date, a finance
 * forecast or a weekly plan. Where nothing was planned, planned is null, never
 * an invented number.
 */
import { addDays, addMonths, diffDays, startOfWeek, type IsoDate } from "./dates";
import { completionPercent } from "./goals";

export const RANGE_KEYS = ["7d", "30d", "90d", "1y", "journey"] as const;
export type FixedRange = (typeof RANGE_KEYS)[number];
export type RangeKey = FixedRange | `month:${string}`;
export const RANGE_LABELS: Record<FixedRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
  journey: "Five-year journey",
};

export type Unit = "day" | "week" | "month";
export type Bucket = { start: IsoDate; end: IsoDate; label: string };
export type ResolvedRange = {
  key: RangeKey;
  label: string;
  from: IsoDate;
  to: IsoDate;
  unit: Unit;
  buckets: Bucket[];
  /** The same number of days immediately before `from`, for comparisons. */
  previous: { from: IsoDate; to: IsoDate };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthName = (d: IsoDate) => MONTHS[Number(d.slice(5, 7)) - 1];

export function parseRangeKey(value: string | null | undefined): RangeKey | null {
  if (!value) return null;
  if ((RANGE_KEYS as readonly string[]).includes(value)) return value as FixedRange;
  const m = /^month:(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return m ? (value as RangeKey) : null;
}

export const firstOfMonth = (d: IsoDate) => `${d.slice(0, 7)}-01`;
export const lastOfMonth = (d: IsoDate) => addDays(addMonths(firstOfMonth(d), 1), -1);

export function bucketsFor(from: IsoDate, to: IsoDate, unit: Unit, weekStartsOn: number): Bucket[] {
  const out: Bucket[] = [];
  if (to < from) return out;
  if (unit === "day") {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ start: d, end: d, label: `${WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${Number(d.slice(8))}` });
  } else if (unit === "week") {
    for (let w = startOfWeek(from, weekStartsOn); w <= to; w = addDays(w, 7)) {
      const start = w < from ? from : w;
      const end = addDays(w, 6) > to ? to : addDays(w, 6);
      out.push({ start, end, label: `${Number(start.slice(8))} ${monthName(start)}` });
    }
  } else {
    for (let m = firstOfMonth(from); m <= to; m = addMonths(m, 1)) {
      const start = m < from ? from : m;
      const end = lastOfMonth(m) > to ? to : lastOfMonth(m);
      out.push({ start, end, label: `${monthName(m)} ${m.slice(2, 4)}` });
    }
  }
  return out;
}

/** Resolves a range against today and the journey. Ranges never extend past today. */
export function resolveRange(key: RangeKey, today: IsoDate, journey: { startDate: IsoDate; endDate: IsoDate }, weekStartsOn: number): ResolvedRange {
  let from: IsoDate;
  let to: IsoDate = today;
  let unit: Unit;
  let label: string;
  if (key.startsWith("month:")) {
    const month = `${key.slice(6)}-01`;
    from = month;
    to = lastOfMonth(month) < today ? lastOfMonth(month) : today;
    if (to < from) to = from; // a future month: an empty, one-day range
    unit = "week";
    label = `${new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`))}`;
  } else {
    const k = key as FixedRange;
    label = RANGE_LABELS[k];
    switch (k) {
      case "7d":
        from = addDays(today, -6);
        unit = "day";
        break;
      case "30d":
        from = addDays(today, -29);
        unit = "week";
        break;
      case "90d":
        from = addDays(today, -89);
        unit = "week";
        break;
      case "1y":
        from = addDays(today, -364);
        unit = "month";
        break;
      case "journey":
        from = journey.startDate;
        to = journey.endDate < today ? journey.endDate : today;
        if (to < from) to = from;
        unit = "month";
        break;
    }
  }
  const length = diffDays(from, to) + 1;
  return {
    key,
    label,
    from,
    to,
    unit,
    buckets: bucketsFor(from, to, unit, weekStartsOn),
    previous: { from: addDays(from, -length), to: addDays(from, -1) },
  };
}

export const inRange = (d: IsoDate | null | undefined, from: IsoDate, to: IsoDate) => !!d && d >= from && d <= to;

// ---------------------------------------------------------------------------
// Goal progress at a past date, rebuilt from measurements (the same rules the
// database uses for current_value: latest, cumulative, or key results).

export type GoalHistory = {
  id: string;
  parentId: string | null;
  isKeyResult: boolean;
  measurementMode: "latest" | "cumulative" | "key_results";
  baselineValue: number;
  targetValue: number;
  archived: boolean;
  measurements: { measuredOn: IsoDate; value: number }[];
};

export function valueOn(goal: GoalHistory, date: IsoDate, all: Map<string, GoalHistory>, children: Map<string, GoalHistory[]>, depth = 0): number {
  if (goal.measurementMode === "key_results") {
    if (depth > 6) return 0;
    const krs = (children.get(goal.id) ?? []).filter((c) => c.isKeyResult && !c.archived);
    if (!krs.length) return 0;
    return krs.reduce((s, c) => s + completionOn(c, date, all, children, depth + 1), 0) / krs.length;
  }
  const upTo = goal.measurements.filter((m) => m.measuredOn <= date);
  if (goal.measurementMode === "cumulative") return goal.baselineValue + upTo.reduce((s, m) => s + m.value, 0);
  if (!upTo.length) return goal.baselineValue;
  // Measurements arrive sorted by date then creation; the last one on or before the date wins.
  return upTo[upTo.length - 1].value;
}

export function completionOn(goal: GoalHistory, date: IsoDate, all: Map<string, GoalHistory>, children: Map<string, GoalHistory[]>, depth = 0): number {
  const currentValue = valueOn(goal, date, all, children, depth);
  const scale = goal.measurementMode === "key_results" ? { baselineValue: 0, targetValue: 100 } : goal;
  return completionPercent({ baselineValue: scale.baselineValue, targetValue: scale.targetValue, currentValue });
}

export function childrenIndex(goals: GoalHistory[]) {
  const map = new Map<string, GoalHistory[]>();
  for (const g of goals) {
    if (!g.parentId) continue;
    const list = map.get(g.parentId) ?? [];
    list.push(g);
    map.set(g.parentId, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Targets and comparisons

const PERIOD_DAYS = { day: 1, week: 7, month: 365.25 / 12, quarter: 365.25 / 4 } as const;

/** A target for one period spread evenly over `days` (e.g. a weekly target over a 3-day bucket). */
export function prorate(target: number, period: keyof typeof PERIOD_DAYS, days: number): number {
  return Math.round((target / PERIOD_DAYS[period]) * days * 10) / 10;
}

export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export const ratio = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

// ---------------------------------------------------------------------------
// Is activity turning into outcomes?

export type ActivityOutcome = {
  area: string;
  activityLabel: string;
  activity: number;
  previousActivity: number;
  outcomeLabel: string;
  outcome: number;
  previousOutcome: number;
};

export type Verdict = { tone: "good" | "warn" | "neutral" | "none"; text: string };

/**
 * A rule-based reading of one activity/outcome pair, comparing outcome per
 * unit of activity with the previous period of the same length. It describes
 * what the numbers show; it does not prove cause.
 */
export function judge(p: ActivityOutcome): Verdict & { efficiency: number | null; previousEfficiency: number | null } {
  const efficiency = p.activity > 0 ? p.outcome / p.activity : null;
  const previousEfficiency = p.previousActivity > 0 ? p.previousOutcome / p.previousActivity : null;
  const base = { efficiency, previousEfficiency };
  if (p.activity <= 0 && p.outcome <= 0) return { ...base, tone: "none", text: "No activity or outcome recorded in this period." };
  if (p.activity <= 0) return { ...base, tone: "neutral", text: "An outcome was recorded without logged activity in this period; it may come from earlier work." };
  if (p.outcome <= 0) return { ...base, tone: "warn", text: "Activity without a measurable outcome in this period." };
  if (previousEfficiency === null || previousEfficiency <= 0) return { ...base, tone: "good", text: "Activity is producing measurable outcomes; there's no earlier period with both to compare against." };
  const change = (efficiency! - previousEfficiency) / previousEfficiency;
  if (change >= 0.1) return { ...base, tone: "good", text: "More outcome per unit of activity than the previous period." };
  if (change <= -0.1) return { ...base, tone: "warn", text: "Less outcome per unit of activity than the previous period: more effort per result." };
  return { ...base, tone: "neutral", text: "About the same outcome per unit of activity as the previous period." };
}

// ---------------------------------------------------------------------------
// CSV

/** RFC 4180 CSV. Text cells that a spreadsheet would run as a formula are prefixed with ' . */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    let s = v;
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
