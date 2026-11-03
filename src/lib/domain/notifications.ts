/**
 * Reminders and notifications. Whether something is due is decided from the
 * user's own preferences and local time; every notification has a dedupe key,
 * so a reminder is created at most once per day (or per event).
 */
import type { IsoDate } from "./dates";

export const NOTIFICATION_KINDS = ["daily_planning", "task_deadlines", "weekly_review", "monthly_review", "habits", "milestones"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const NOTIFICATION_LABELS: Record<NotificationKind, { label: string; description: string }> = {
  daily_planning: { label: "Daily planning", description: "Morning nudge to pick today's top priorities, if you haven't yet." },
  task_deadlines: { label: "Task deadlines", description: "Tasks due today and overdue ones." },
  weekly_review: { label: "Weekly review", description: "On your review day, if the week isn't reviewed." },
  monthly_review: { label: "Monthly review", description: "On the last day of the month: check monthly objectives." },
  habits: { label: "Habits", description: "Evening reminder of habits not checked in today." },
  milestones: { label: "Goal milestones", description: "Goals achieved, and goals due within a week that are behind." },
};

export type Preferences = {
  daily_planning: { enabled: boolean; time: string };
  task_deadlines: { enabled: boolean; time: string };
  weekly_review: { enabled: boolean; time: string; weekday: number };
  monthly_review: { enabled: boolean; time: string };
  habits: { enabled: boolean; time: string };
  milestones: { enabled: boolean };
  quietStart: string | null;
  quietEnd: string | null;
  push: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  daily_planning: { enabled: true, time: "07:30" },
  task_deadlines: { enabled: true, time: "08:00" },
  weekly_review: { enabled: true, time: "17:00", weekday: 5 },
  monthly_review: { enabled: true, time: "17:00" },
  habits: { enabled: true, time: "20:00" },
  milestones: { enabled: true },
  quietStart: "22:00",
  quietEnd: "07:00",
  push: true,
};

export type LocalNow = { date: IsoDate; time: string; weekday: number };

/** The user's local date, HH:MM and weekday for a UTC instant. */
export function localNow(timeZone: string, now: Date = new Date()): LocalNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday };
}

/** Quiet hours may wrap midnight (22:00–07:00). */
export function inQuietHours(time: string, start: string | null, end: string | null) {
  if (!start || !end || start === end) return false;
  return start < end ? time >= start && time < end : time >= start || time < end;
}

export type DueInput = {
  now: LocalNow;
  prefs: Preferences;
  mitsSetToday: number;
  tasksDueToday: number;
  tasksOverdue: number;
  weekReviewed: boolean;
  habitsOpenToday: number;
  achievedGoals: { id: string; title: string }[];
  behindGoalsDueSoon: { id: string; title: string; targetDate: IsoDate; progressPct: number }[];
};

export type DueNotification = { kind: NotificationKind; dedupeKey: string; title: string; body: string; url: string };

export function lastDayOfMonth(d: IsoDate): IsoDate {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Everything due right now. Reminders fire from their time onward; dedupe keys stop repeats. */
export function dueNotifications(i: DueInput): DueNotification[] {
  const out: DueNotification[] = [];
  const { date, time, weekday } = i.now;
  const p = i.prefs;
  if (p.daily_planning.enabled && time >= p.daily_planning.time && i.mitsSetToday < 3) {
    out.push({
      kind: "daily_planning",
      dedupeKey: `daily_planning:${date}`,
      title: "Plan today",
      body: i.mitsSetToday ? `${i.mitsSetToday} of 3 top priorities set. Pick the rest.` : "Pick today's three most important tasks.",
      url: "/today",
    });
  }
  if (p.task_deadlines.enabled && time >= p.task_deadlines.time && (i.tasksDueToday || i.tasksOverdue)) {
    out.push({
      kind: "task_deadlines",
      dedupeKey: `task_deadlines:${date}`,
      title: i.tasksDueToday ? `${i.tasksDueToday} task(s) due today` : `${i.tasksOverdue} overdue task(s)`,
      body: [i.tasksDueToday ? `${i.tasksDueToday} due today` : null, i.tasksOverdue ? `${i.tasksOverdue} overdue` : null].filter(Boolean).join(", ") + ".",
      url: "/today",
    });
  }
  if (p.weekly_review.enabled && weekday === p.weekly_review.weekday && time >= p.weekly_review.time && !i.weekReviewed) {
    out.push({ kind: "weekly_review", dedupeKey: `weekly_review:${date}`, title: "Weekly review", body: "Review the week: what moved, what didn't, and next week's goals.", url: "/review" });
  }
  if (p.monthly_review.enabled && date === lastDayOfMonth(date) && time >= p.monthly_review.time) {
    out.push({ kind: "monthly_review", dedupeKey: `monthly_review:${date.slice(0, 7)}`, title: "Monthly review", body: "Last day of the month: check your monthly objectives and set next month's.", url: "/roadmap" });
  }
  if (p.habits.enabled && time >= p.habits.time && i.habitsOpenToday > 0) {
    out.push({ kind: "habits", dedupeKey: `habits:${date}`, title: `${i.habitsOpenToday} habit(s) left today`, body: "Check in, or mark a rest day.", url: "/checkin" });
  }
  if (p.milestones.enabled) {
    for (const g of i.achievedGoals) out.push({ kind: "milestones", dedupeKey: `goal_achieved:${g.id}`, title: "Goal achieved", body: g.title, url: `/goals/${g.id}` });
    for (const g of i.behindGoalsDueSoon) {
      out.push({ kind: "milestones", dedupeKey: `goal_due_soon:${g.id}:${g.targetDate}`, title: "Goal due soon and behind", body: `${g.title}: ${g.progressPct}% done, due ${g.targetDate}.`, url: `/goals/${g.id}` });
    }
  }
  return out;
}
