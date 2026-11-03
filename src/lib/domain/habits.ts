/**
 * Habits: flexible schedules, rest days, consistency, streaks, missed-habit
 * analysis and correlation with daily priorities. Missing a day is data, not
 * a penalty: there are no points to lose, rest days are excused, and a day
 * that isn't over yet never counts against you.
 */
import { addDays, type IsoDate, startOfWeek } from "./dates";

export const DEFAULT_HABITS: { name: string; scheduleKind: ScheduleKind; scheduleDays: number[]; weeklyTarget: number | null; description: string }[] = [
  { name: "Wake up on time", scheduleKind: "days", scheduleDays: [0, 1, 2, 3, 4, 5, 6], weeklyTarget: null, description: "Up at your planned time." },
  { name: "Exercise", scheduleKind: "weekly", scheduleDays: [0, 1, 2, 3, 4, 5, 6], weeklyTarget: 3, description: "Any days, three times a week." },
  { name: "Read", scheduleKind: "days", scheduleDays: [0, 1, 2, 3, 4, 5, 6], weeklyTarget: null, description: "Even 15 minutes counts." },
  { name: "Practice communication", scheduleKind: "days", scheduleDays: [1, 2, 3, 4, 5], weeklyTarget: null, description: "A daily speaking or writing exercise." },
  { name: "Study sales", scheduleKind: "days", scheduleDays: [1, 2, 3, 4, 5], weeklyTarget: null, description: "Psychology lab review, a case study or a call breakdown." },
  { name: "Work on my product", scheduleKind: "days", scheduleDays: [1, 2, 3, 4, 5], weeklyTarget: null, description: "A focused block on the product, validation included." },
  { name: "Publish or prepare content", scheduleKind: "weekly", scheduleDays: [0, 1, 2, 3, 4, 5, 6], weeklyTarget: 3, description: "Script, record, edit or publish." },
  { name: "Review daily goals", scheduleKind: "days", scheduleDays: [0, 1, 2, 3, 4, 5, 6], weeklyTarget: null, description: "Look at today's priorities in the morning." },
  { name: "Sleep on time", scheduleKind: "days", scheduleDays: [0, 1, 2, 3, 4, 5, 6], weeklyTarget: null, description: "In bed at your planned time." },
];

export const SCHEDULE_KINDS = ["days", "weekly"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];
export const CHECKIN_STATUSES = ["done", "skipped", "rest"] as const;
export type CheckinStatus = (typeof CHECKIN_STATUSES)[number];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type HabitDef = {
  id: string;
  name: string;
  scheduleKind: ScheduleKind;
  scheduleDays: number[];
  weeklyTarget: number | null;
  startedOn: IsoDate;
};

export type HabitContext = {
  checkins: Map<IsoDate, { status: CheckinStatus; note: string | null }>;
  /** Global rest days (illness, travel): every habit is excused. */
  restDays: Set<IsoDate>;
  today: IsoDate;
  weekStartsOn: number;
};

export const weekday = (d: IsoDate) => new Date(`${d}T00:00:00Z`).getUTCDay();

export type DayState = "done" | "missed" | "rest" | "pending" | "off";

/** What a day means for a fixed-weekday habit. */
export function dayState(h: HabitDef, day: IsoDate, ctx: HabitContext): DayState {
  if (day > ctx.today || day < h.startedOn) return "off";
  const c = ctx.checkins.get(day);
  if (c?.status === "done") return "done";
  if (c?.status === "rest" || ctx.restDays.has(day)) return "rest";
  if (h.scheduleKind === "weekly") return c?.status === "skipped" ? "missed" : "off";
  if (!h.scheduleDays.includes(weekday(day))) return "off";
  if (day === ctx.today) return c?.status === "skipped" ? "missed" : "pending";
  return "missed";
}

const days = (from: IsoDate, to: IsoDate) => {
  const out: IsoDate[] = [];
  for (let d = from; d <= to && out.length < 4000; d = addDays(d, 1)) out.push(d);
  return out;
};

export type Consistency = { done: number; expected: number; rate: number | null };

/** Weekly-target habits: each week needs `target` done, reduced by rest days; an unfinished week below target is left out. */
function weekResult(h: HabitDef, weekStart: IsoDate, ctx: HabitContext) {
  const weekDays = days(weekStart, addDays(weekStart, 6)).filter((d) => d >= h.startedOn);
  const done = weekDays.filter((d) => d <= ctx.today && ctx.checkins.get(d)?.status === "done").length;
  const rest = weekDays.filter((d) => ctx.checkins.get(d)?.status === "rest" || ctx.restDays.has(d)).length;
  const available = weekDays.length;
  const target = Math.max(0, Math.min(h.weeklyTarget ?? 1, available) - rest);
  const finished = addDays(weekStart, 6) < ctx.today;
  return { done, target, finished, met: done >= target && target > 0, counted: target > 0 && (finished || done >= target) };
}

export function consistency(h: HabitDef, from: IsoDate, to: IsoDate, ctx: HabitContext): Consistency {
  if (h.scheduleKind === "weekly") {
    let done = 0;
    let expected = 0;
    for (let w = startOfWeek(from, ctx.weekStartsOn); w <= to; w = addDays(w, 7)) {
      if (addDays(w, 6) < h.startedOn || w > ctx.today) continue;
      const r = weekResult(h, w, ctx);
      if (!r.counted) continue;
      done += Math.min(r.done, r.target);
      expected += r.target;
    }
    return { done, expected, rate: expected ? done / expected : null };
  }
  let doneScheduled = 0;
  let extra = 0;
  let missed = 0;
  for (const d of days(from, to)) {
    const s = dayState(h, d, ctx);
    const scheduled = h.scheduleDays.includes(weekday(d));
    if (s === "done") {
      if (scheduled) doneScheduled += 1;
      else extra += 1;
    } else if (s === "missed") missed += 1;
  }
  const expected = doneScheduled + missed;
  // Doing it on another day makes up for a missed one (flexible), never above 100 %.
  const done = Math.min(expected, doneScheduled + extra);
  return { done, expected, rate: expected ? done / expected : null };
}

/** Current and best streaks. Rest days and unscheduled days neither break nor extend a streak. */
export function streaks(h: HabitDef, ctx: HabitContext): { current: number; best: number; unit: "days" | "weeks" } {
  if (h.scheduleKind === "weekly") {
    const weeks: ReturnType<typeof weekResult>[] = [];
    for (let w = startOfWeek(h.startedOn, ctx.weekStartsOn); w <= ctx.today; w = addDays(w, 7)) weeks.push(weekResult(h, w, ctx));
    let best = 0;
    let run = 0;
    for (const r of weeks) {
      if (r.target === 0) continue;
      if (r.met) best = Math.max(best, ++run);
      else if (r.finished) run = 0;
    }
    let current = 0;
    for (let i = weeks.length - 1; i >= 0; i--) {
      const r = weeks[i];
      if (r.target === 0 || (!r.finished && !r.met)) continue;
      if (r.met) current += 1;
      else break;
    }
    return { current, best, unit: "weeks" };
  }
  let best = 0;
  let run = 0;
  for (const d of days(h.startedOn, ctx.today)) {
    const s = dayState(h, d, ctx);
    if (s === "done") best = Math.max(best, ++run);
    else if (s === "missed") run = 0;
  }
  let current = 0;
  for (let d = ctx.today; d >= h.startedOn; d = addDays(d, -1)) {
    const s = dayState(h, d, ctx);
    if (s === "done") current += 1;
    else if (s === "missed") break;
  }
  return { current, best, unit: "days" };
}

/** Where and why a habit slips: missed days by weekday and the notes you left. */
export function missedAnalysis(h: HabitDef, from: IsoDate, ctx: HabitContext) {
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const missedDays: IsoDate[] = [];
  const reasons: { day: IsoDate; note: string }[] = [];
  for (const d of days(from, ctx.today)) {
    if (dayState(h, d, ctx) !== "missed") continue;
    missedDays.push(d);
    byWeekday[weekday(d)] += 1;
    const note = ctx.checkins.get(d)?.note;
    if (note) reasons.push({ day: d, note });
  }
  const missedWeeks: IsoDate[] = [];
  if (h.scheduleKind === "weekly") {
    for (let w = startOfWeek(from, ctx.weekStartsOn); w <= ctx.today; w = addDays(w, 7)) {
      if (addDays(w, 6) < h.startedOn) continue;
      const r = weekResult(h, w, ctx);
      if (r.finished && r.target > 0 && !r.met) missedWeeks.push(w);
    }
  }
  const worst = Math.max(...byWeekday);
  return {
    missedDays,
    missedWeeks,
    byWeekday,
    hardestDay: worst > 0 ? byWeekday.indexOf(worst) : null,
    reasons: reasons.slice(-10).reverse(),
  };
}

/** One row per week: overall consistency across habits. */
export function weeklyTrend(habits: { def: HabitDef; ctx: HabitContext }[], weeks: number, today: IsoDate, weekStartsOn: number) {
  const thisWeek = startOfWeek(today, weekStartsOn);
  return [...Array(weeks)].map((_, i) => {
    const w = addDays(thisWeek, -7 * (weeks - 1 - i));
    let done = 0;
    let expected = 0;
    for (const { def, ctx } of habits) {
      const c = consistency(def, w, addDays(w, 6), ctx);
      done += c.done;
      expected += c.expected;
    }
    return { weekStart: w, done, expected, rate: expected ? done / expected : null };
  });
}

export const MIN_CORRELATION_DAYS = 5;

/**
 * Days the habit was done vs missed, compared on the share of that day's top
 * priorities (MITs) completed. Correlation, not causation; needs enough days in
 * both groups.
 */
export function priorityCorrelation(h: HabitDef, from: IsoDate, ctx: HabitContext, mitScore: Map<IsoDate, number>) {
  const done: number[] = [];
  const missed: number[] = [];
  for (const d of days(from, addDays(ctx.today, -1))) {
    const score = mitScore.get(d);
    if (score == null) continue;
    const s = dayState(h, d, ctx);
    if (s === "done") done.push(score);
    else if (s === "missed" || (h.scheduleKind === "weekly" && s === "off" && d >= h.startedOn && !ctx.restDays.has(d))) missed.push(score);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const doneAvg = avg(done);
  const otherAvg = avg(missed);
  const enough = done.length >= MIN_CORRELATION_DAYS && missed.length >= MIN_CORRELATION_DAYS;
  return {
    doneDays: done.length,
    otherDays: missed.length,
    doneAvg,
    otherAvg,
    difference: enough && doneAvg != null && otherAvg != null ? doneAvg - otherAvg : null,
    enough,
  };
}
