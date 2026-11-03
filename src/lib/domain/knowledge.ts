/**
 * Knowledge and reading: resources, concepts, practical applications that
 * link knowledge to real tasks and the sales journal, a reading goal and a
 * daily reading log.
 */
import { addDays, diffDays, type IsoDate } from "./dates";

export const RESOURCE_KINDS = ["book", "course", "paper", "podcast", "video", "article", "case_study", "observation"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  book: "Book",
  course: "Course",
  paper: "Research paper",
  podcast: "Podcast",
  video: "Video",
  article: "Article",
  case_study: "Sales case study",
  observation: "Personal observation",
};
/** What "progress" counts for each kind. */
export const PROGRESS_UNIT: Record<ResourceKind, string | null> = {
  book: "pages",
  course: "lessons",
  paper: "pages",
  podcast: "minutes",
  video: "minutes",
  article: null,
  case_study: null,
  observation: null,
};

export const RESOURCE_STATUSES = ["want", "in_progress", "completed", "abandoned"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];
export const RESOURCE_STATUS_LABELS: Record<ResourceStatus, string> = {
  want: "Want to read",
  in_progress: "In progress",
  completed: "Completed",
  abandoned: "Stopped",
};

export const APPLICATION_STATUSES = ["planned", "practising", "done", "dropped"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  planned: "Planned",
  practising: "Practising",
  done: "Done",
  dropped: "Dropped",
};

/** Source types used when a concept is promoted to the psychology lab. */
export const PSYCH_SOURCE_TYPE: Record<ResourceKind, "popular_book" | "peer_reviewed" | "course" | "podcast" | "video" | "article" | "observation"> = {
  book: "popular_book",
  course: "course",
  paper: "peer_reviewed",
  podcast: "podcast",
  video: "video",
  article: "article",
  case_study: "observation",
  observation: "observation",
};

export type Session = { readOn: IsoDate; minutes: number };

/**
 * Daily reading: today's minutes, the last 7 days, and a streak of days that
 * met the daily target. Today only counts once it is met, so an unfinished
 * today never breaks the streak.
 */
export function readingStats(sessions: Session[], dailyMinutes: number | null, today: IsoDate) {
  const byDay = new Map<IsoDate, number>();
  for (const s of sessions) byDay.set(s.readOn, (byDay.get(s.readOn) ?? 0) + s.minutes);
  const todayMinutes = byDay.get(today) ?? 0;
  const last7 = [...Array(7)].map((_, i) => {
    const d = addDays(today, i - 6);
    return { date: d, minutes: byDay.get(d) ?? 0 };
  });
  const target = dailyMinutes && dailyMinutes > 0 ? dailyMinutes : null;
  let streak = 0;
  if (target) {
    let d = todayMinutes >= target ? today : addDays(today, -1);
    while ((byDay.get(d) ?? 0) >= target) {
      streak += 1;
      d = addDays(d, -1);
    }
  }
  const daysRead30 = [...Array(30)].filter((_, i) => (byDay.get(addDays(today, -i)) ?? 0) > 0).length;
  return {
    todayMinutes,
    target,
    targetMet: target ? todayMinutes >= target : null,
    last7,
    weekMinutes: last7.reduce((a, d) => a + d.minutes, 0),
    streak,
    daysRead30,
  };
}

/** Progress towards a yearly completion goal, with an even-pace reference (a plan, not a forecast). */
export function goalProgress(completedThisYear: number, target: number | null, today: IsoDate) {
  if (!target) return null;
  const year = Number(today.slice(0, 4));
  const dayOfYear = diffDays(`${year}-01-01`, today) + 1;
  const daysInYear = diffDays(`${year}-01-01`, `${year + 1}-01-01`);
  const expected = Math.round(((target * dayOfYear) / daysInYear) * 10) / 10;
  return {
    completed: completedThisYear,
    target,
    pct: Math.min(1, completedThisYear / target),
    expectedByToday: expected,
    status: completedThisYear >= expected ? ("on_pace" as const) : ("behind" as const),
  };
}
