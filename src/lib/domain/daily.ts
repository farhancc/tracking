/**
 * Daily execution: pure rules for the Today screen.
 *
 * Daily progress = 50% most-important tasks done + 30% other planned work
 * done (weighted by estimated minutes, so ten trivial tasks don't outweigh
 * one big one) + 20% scheduled habits done. Missing parts are dropped and the
 * rest re-weighted.
 */
import { addYears, diffDays, type IsoDate } from "./dates";

export const MIT_RANKS = [1, 2, 3] as const;
export type MitRank = (typeof MIT_RANKS)[number];
export const MIT_LABELS: Record<MitRank, string> = {
  1: "Most important task",
  2: "Second important task",
  3: "Third important task",
};

/** Minutes assumed for tasks without an estimate when weighting progress. */
export const DEFAULT_TASK_MINUTES = 30;

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function journeyDay(journey: { startDate: IsoDate; endDate: IsoDate }, today: IsoDate) {
  const total = diffDays(journey.startDate, journey.endDate) + 1;
  const day = diffDays(journey.startDate, today) + 1;
  return {
    day: Math.max(0, Math.min(day, total)),
    total,
    // Calendar years from the start date (leap years included), capped at 5.
    year: day < 1 ? 0 : 1 + [1, 2, 3, 4].filter((k) => today >= addYears(journey.startDate, k)).length,
    started: day >= 1,
    finished: day > total,
  };
}

export type ProgressTask = { status: "todo" | "doing" | "done" | "cancelled"; estimatedMinutes: number | null; mitRank: number | null };
export type ProgressHabit = { status: "done" | "skipped" | null };

export type DailyProgress = {
  pct: number | null;
  mits: { set: number; done: number };
  work: { plannedMinutes: number; doneMinutes: number };
  habits: { scheduled: number; done: number; skipped: number };
};

export function dailyProgress(input: { tasks: ProgressTask[]; habits: ProgressHabit[] }): DailyProgress {
  const live = input.tasks.filter((t) => t.status !== "cancelled");
  const mits = live.filter((t) => t.mitRank !== null);
  const others = live.filter((t) => t.mitRank === null);
  const minutes = (t: ProgressTask) => t.estimatedMinutes || DEFAULT_TASK_MINUTES;
  const plannedMinutes = others.reduce((s, t) => s + minutes(t), 0);
  const doneMinutes = others.filter((t) => t.status === "done").reduce((s, t) => s + minutes(t), 0);
  const habitsConsidered = input.habits.filter((h) => h.status !== "skipped");

  const parts: { weight: number; value: number }[] = [];
  if (mits.length) parts.push({ weight: 0.5, value: mits.filter((t) => t.status === "done").length / mits.length });
  if (others.length) parts.push({ weight: 0.3, value: doneMinutes / plannedMinutes });
  if (habitsConsidered.length) parts.push({ weight: 0.2, value: habitsConsidered.filter((h) => h.status === "done").length / habitsConsidered.length });
  const weight = parts.reduce((s, p) => s + p.weight, 0);
  // + 1e-9 so binary floating point (e.g. 57.4999…) doesn't round a true .5 down.
  const pct = weight ? Math.round((parts.reduce((s, p) => s + p.weight * p.value, 0) / weight) * 100 + 1e-9) : null;

  return {
    pct,
    mits: { set: mits.length, done: mits.filter((t) => t.status === "done").length },
    work: { plannedMinutes, doneMinutes },
    habits: {
      scheduled: input.habits.length,
      done: input.habits.filter((h) => h.status === "done").length,
      skipped: input.habits.filter((h) => h.status === "skipped").length,
    },
  };
}

/** Minutes between two instants, at least 1. */
export function elapsedMinutes(startedAt: Date, finishedAt: Date): number {
  return Math.max(1, Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000));
}

/** "HH:MM" (24h) or null. */
export function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isScheduledOn(days: number[], date: IsoDate): boolean {
  const [y, m, d] = date.split("-").map(Number);
  return days.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}
