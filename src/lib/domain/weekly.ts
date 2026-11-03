/**
 * Weekly goal management: pure rules.
 *
 * The weekly score measures OUTCOMES and MEANINGFUL DELIVERABLES, never the
 * number of tasks: weekly-goal outcome completion (60%) and the share of
 * planned deliverable tasks actually delivered (40%). Adding more tasks can
 * only lower or keep the score, never raise it.
 */
import { addDays, startOfWeek, type IsoDate } from "./dates";

export const FOCUS_AREAS = ["sales", "product", "marketing", "content", "learning", "personal"] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];
export const FOCUS_AREA_LABELS: Record<FocusArea, string> = {
  sales: "Sales",
  product: "Product development",
  marketing: "Marketing",
  content: "Content",
  learning: "Learning",
  personal: "Personal development",
};
/** Default pillar key for each focus area (editable per goal). */
export const FOCUS_AREA_PILLAR: Record<FocusArea, string> = {
  sales: "sales",
  product: "product",
  marketing: "product",
  content: "brand",
  learning: "sales",
  personal: "wealth",
};

/** Weekly goals must roll up to one of these levels. */
export const WEEKLY_PARENT_LEVELS = ["annual", "quarterly", "monthly"] as const;

export const TASK_PRIORITIES = [1, 2, 3, 4] as const;
export const TASK_PRIORITY_LABELS: Record<number, string> = { 1: "Critical", 2: "High", 3: "Normal", 4: "Low" };

export type Week = { weekStart: IsoDate; weekEnd: IsoDate };

export function weekOf(date: IsoDate, weekStartsOn: number): Week {
  const weekStart = startOfWeek(date, weekStartsOn);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

export function shiftWeek(weekStart: IsoDate, weeks: number): IsoDate {
  return addDays(weekStart, weeks * 7);
}

export function isWeekStart(date: IsoDate, weekStartsOn: number): boolean {
  return startOfWeek(date, weekStartsOn) === date;
}

/** The weekly goal's period: the week, clamped to its parent's period. */
export function weeklyGoalPeriod(week: Week, parent: { startDate: IsoDate; targetDate: IsoDate }) {
  const startDate = week.weekStart > parent.startDate ? week.weekStart : parent.startDate;
  const targetDate = week.weekEnd < parent.targetDate ? week.weekEnd : parent.targetDate;
  return startDate <= targetDate ? { startDate, targetDate } : null;
}

export type ScorecardGoal = { area: FocusArea | null; completionPct: number; status: string; isTargetMet: boolean };
export type ScorecardTask = {
  status: "todo" | "doing" | "done" | "cancelled";
  isDeliverable: boolean;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  carryCount: number;
  area: FocusArea | null;
};

export type Insight = { level: "positive" | "info" | "warning"; message: string };

export type WeeklyScorecard = {
  score: number | null;
  goals: { total: number; met: number; averageCompletion: number | null };
  deliverables: { planned: number; delivered: number; rate: number | null };
  tasks: { planned: number; done: number; unfinished: number; carriedIn: number; chronic: number };
  time: {
    estimatedMinutes: number;
    actualMinutes: number;
    capacityMinutes: number | null;
    /** actual ÷ estimated for finished tasks that have both (1 = perfect, 1.4 = took 40% longer). */
    estimateRatio: number | null;
  };
  byArea: { area: FocusArea; goals: number; averageCompletion: number | null; deliverablesPlanned: number; deliverablesDelivered: number }[];
  insights: Insight[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function weeklyScorecard(input: { goals: ScorecardGoal[]; tasks: ScorecardTask[]; capacityHours: number | null }): WeeklyScorecard {
  const live = input.tasks.filter((t) => t.status !== "cancelled");
  const deliverables = live.filter((t) => t.isDeliverable);
  const delivered = deliverables.filter((t) => t.status === "done");
  const done = live.filter((t) => t.status === "done");

  const goalAvg = avg(input.goals.map((g) => g.completionPct));
  const deliverableRate = deliverables.length ? (delivered.length / deliverables.length) * 100 : null;

  let score: number | null = null;
  if (goalAvg !== null && deliverableRate !== null) score = Math.round(0.6 * goalAvg + 0.4 * deliverableRate);
  else if (goalAvg !== null) score = Math.round(goalAvg);
  else if (deliverableRate !== null) score = Math.round(deliverableRate);

  const timed = done.filter((t) => t.estimatedMinutes && t.actualMinutes);
  const estSum = timed.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);
  const actSum = timed.reduce((s, t) => s + (t.actualMinutes ?? 0), 0);
  const estimateRatio = estSum > 0 && timed.length >= 2 ? Math.round((actSum / estSum) * 100) / 100 : null;

  const estimatedMinutes = live.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);
  const actualMinutes = live.reduce((s, t) => s + (t.actualMinutes ?? 0), 0);
  const capacityMinutes = input.capacityHours ? Math.round(input.capacityHours * 60) : null;

  const unfinished = live.filter((t) => t.status !== "done").length;
  const chronic = live.filter((t) => t.status !== "done" && t.carryCount >= 2).length;
  const carriedIn = live.filter((t) => t.carryCount > 0).length;

  const byArea = (
    Array.from(new Set([...input.goals.map((g) => g.area), ...deliverables.map((t) => t.area)].filter(Boolean))) as FocusArea[]
  )
    .sort()
    .map((area) => {
      const g = input.goals.filter((x) => x.area === area);
      const d = deliverables.filter((x) => x.area === area);
      const a = avg(g.map((x) => x.completionPct));
      return {
        area,
        goals: g.length,
        averageCompletion: a === null ? null : round1(a),
        deliverablesPlanned: d.length,
        deliverablesDelivered: d.filter((x) => x.status === "done").length,
      };
    });

  const insights: Insight[] = [];
  if (input.goals.length === 0) insights.push({ level: "info", message: "No weekly goals yet. Each week needs at least one goal linked to a bigger objective." });
  if (deliverables.length === 0 && live.length > 0) {
    insights.push({ level: "warning", message: "None of this week's tasks is marked as a deliverable, so there is nothing meaningful to measure them by." });
  }
  const routineDone = done.filter((t) => !t.isDeliverable).length;
  if (routineDone >= 5 && delivered.length < deliverables.length) {
    insights.push({
      level: "warning",
      message: `You completed ${done.length} tasks but only ${delivered.length} of ${deliverables.length} deliverables. Activity is not translating into output.`,
    });
  }
  if (live.length > 25) {
    insights.push({ level: "info", message: `${live.length} tasks planned. Long task lists don't raise your score: focus on the deliverables.` });
  }
  if (chronic > 0) {
    insights.push({ level: "warning", message: `${chronic} unfinished task${chronic === 1 ? " has" : "s have"} been carried forward twice or more. Split, delegate or drop ${chronic === 1 ? "it" : "them"}.` });
  }
  if (estimateRatio !== null && estimateRatio >= 1.25) {
    insights.push({ level: "info", message: `Finished tasks took ${Math.round((estimateRatio - 1) * 100)}% longer than estimated. Plan with more buffer.` });
  }
  if (capacityMinutes && estimatedMinutes > capacityMinutes) {
    insights.push({
      level: "warning",
      message: `${round1(estimatedMinutes / 60)} h of tasks planned against ${round1(capacityMinutes / 60)} h available.`,
    });
  }
  if (goalAvg !== null && goalAvg >= 80 && (deliverableRate ?? 100) >= 80) {
    insights.push({ level: "positive", message: "Strong week: outcomes and deliverables both landed." });
  }

  return {
    score,
    goals: {
      total: input.goals.length,
      met: input.goals.filter((g) => g.isTargetMet || g.status === "achieved").length,
      averageCompletion: goalAvg === null ? null : round1(goalAvg),
    },
    deliverables: {
      planned: deliverables.length,
      delivered: delivered.length,
      rate: deliverableRate === null ? null : Math.round(deliverableRate),
    },
    tasks: { planned: live.length, done: done.length, unfinished, carriedIn, chronic },
    time: { estimatedMinutes, actualMinutes, capacityMinutes, estimateRatio },
    byArea,
    insights,
  };
}

export function formatMinutes(min: number | null | undefined): string {
  if (!min) return "0 m";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h} h ${m} m` : `${h} h`) : `${m} m`;
}

/** Parses "90", "1.5h", "1h 30m" or "45m" into minutes. Returns null for empty input, NaN when unreadable. */
export function parseMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "") return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const m = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/.exec(s);
  if (!m || (!m[1] && !m[2])) return Number.NaN;
  return Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
}
