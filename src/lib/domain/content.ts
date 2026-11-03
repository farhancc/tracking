/**
 * Personal brand content: pillars, platforms and formats, the production
 * pipeline, and metric snapshots. Engagement figures are always computed
 * from recorded counts, never typed in.
 */
import type { IsoDate } from "./dates";

export const DEFAULT_POSITIONING =
  "I build technology products, study communication and sales psychology, and share practical lessons about selling, persuasion and human behaviour.";

export const DEFAULT_CONTENT_PILLARS = [
  "Communication",
  "Sales psychology",
  "Persuasion and negotiation",
  "Human behaviour",
  "Practical sales",
  "Entrepreneurship",
  "Technology and product building",
] as const;

export const PLATFORMS = ["instagram", "youtube", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABELS: Record<Platform, string> = { instagram: "Instagram", youtube: "YouTube", linkedin: "LinkedIn" };
export const PLATFORM_SHORT: Record<Platform, string> = { instagram: "IG", youtube: "YT", linkedin: "LI" };

export const FORMATS = ["reel", "carousel", "post", "story", "long_video", "short", "live", "article", "document", "newsletter", "text_post", "video"] as const;
export type Format = (typeof FORMATS)[number];
export const FORMAT_LABELS: Record<Format, string> = {
  reel: "Reel",
  carousel: "Carousel",
  post: "Photo post",
  story: "Story",
  long_video: "Long-form video",
  short: "Short",
  live: "Live",
  article: "Article",
  document: "Document / carousel",
  newsletter: "Newsletter",
  text_post: "Text post",
  video: "Video",
};
export const FORMATS_BY_PLATFORM: Record<Platform, readonly Format[]> = {
  instagram: ["reel", "carousel", "post", "story", "live"],
  youtube: ["long_video", "short", "live"],
  linkedin: ["text_post", "document", "video", "article", "newsletter"],
};
export const isFormatFor = (platform: Platform, format: Format) => FORMATS_BY_PLATFORM[platform].includes(format);

export const CONTENT_STATUSES = ["idea", "research", "script", "recording", "editing", "scheduled", "published", "reviewed"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  idea: "Idea",
  research: "Research",
  script: "Script",
  recording: "Recording",
  editing: "Editing",
  scheduled: "Scheduled",
  published: "Published",
  reviewed: "Performance review",
};
export const statusIndex = (s: ContentStatus) => CONTENT_STATUSES.indexOf(s);
export const nextStatus = (s: ContentStatus): ContentStatus | null => CONTENT_STATUSES[statusIndex(s) + 1] ?? null;
/** From Script onwards an item belongs to a platform and format. */
export const needsPlatform = (s: ContentStatus) => statusIndex(s) >= statusIndex("script");
export const isPublished = (s: ContentStatus) => s === "published" || s === "reviewed";

// ---------------------------------------------------------------------------
// Metrics

/** Counts and durations captured from a platform's insights on one date (cumulative since publishing). */
export type MetricSnapshot = {
  capturedOn: IsoDate;
  views: number | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  watchTimeMinutes: number | null;
  avgViewSeconds: number | null;
  avgRetentionPct: number | null;
  completionRatePct: number | null;
  profileVisits: number | null;
  followersGained: number | null;
  websiteClicks: number | null;
  leads: number | null;
  salesCount: number | null;
  salesAmount: number | null;
};

export const METRIC_FIELDS = [
  "views",
  "reach",
  "impressions",
  "likes",
  "comments",
  "shares",
  "saves",
  "watchTimeMinutes",
  "avgViewSeconds",
  "avgRetentionPct",
  "completionRatePct",
  "profileVisits",
  "followersGained",
  "websiteClicks",
  "leads",
  "salesCount",
  "salesAmount",
] as const satisfies readonly (keyof MetricSnapshot)[];
export type MetricField = (typeof METRIC_FIELDS)[number];

export const METRIC_LABELS: Record<MetricField, string> = {
  views: "Views",
  reach: "Reach (unique accounts)",
  impressions: "Impressions",
  likes: "Likes / reactions",
  comments: "Comments",
  shares: "Shares / reposts",
  saves: "Saves",
  watchTimeMinutes: "Watch time (minutes)",
  avgViewSeconds: "Average view duration (seconds)",
  avgRetentionPct: "Average retention (%)",
  completionRatePct: "Completion rate (%)",
  profileVisits: "Profile visits",
  followersGained: "Followers gained",
  websiteClicks: "Website / link clicks",
  leads: "Leads generated",
  salesCount: "Sales attributed (count)",
  salesAmount: "Sales attributed (amount)",
};

/** Which fields each platform's insights actually report, so forms only ask for real numbers. */
export const METRICS_BY_PLATFORM: Record<Platform, readonly MetricField[]> = {
  instagram: ["views", "reach", "impressions", "likes", "comments", "shares", "saves", "watchTimeMinutes", "avgViewSeconds", "profileVisits", "followersGained", "websiteClicks", "leads", "salesCount", "salesAmount"],
  youtube: ["views", "impressions", "likes", "comments", "shares", "watchTimeMinutes", "avgViewSeconds", "avgRetentionPct", "completionRatePct", "followersGained", "websiteClicks", "leads", "salesCount", "salesAmount"],
  linkedin: ["impressions", "reach", "views", "likes", "comments", "shares", "saves", "profileVisits", "followersGained", "websiteClicks", "leads", "salesCount", "salesAmount"],
};
export const PERCENT_FIELDS: readonly MetricField[] = ["avgRetentionPct", "completionRatePct"];

/** Interactions: likes + comments + shares + saves (whatever was recorded). */
export function engagement(m: Pick<MetricSnapshot, "likes" | "comments" | "shares" | "saves">): number | null {
  const parts = [m.likes, m.comments, m.shares, m.saves].filter((x): x is number => x != null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

/** Engagement ÷ reach, falling back to views, then impressions; the base is named. */
export function engagementRate(m: MetricSnapshot): { rate: number; base: "reach" | "views" | "impressions" } | null {
  const e = engagement(m);
  if (e == null) return null;
  for (const base of ["reach", "views", "impressions"] as const) {
    const d = m[base];
    if (d != null && d > 0) return { rate: e / d, base };
  }
  return null;
}

/**
 * Current figures: each metric's most recently recorded value. A partial
 * capture (only some numbers) updates those numbers without erasing the rest.
 */
export function mergeLatest<T extends MetricSnapshot & { platformMetrics?: Record<string, number> }>(snaps: T[]): T | null {
  if (!snaps.length) return null;
  const sorted = [...snaps].sort((a, b) => b.capturedOn.localeCompare(a.capturedOn));
  const out = { ...sorted[0], platformMetrics: { ...(sorted[0].platformMetrics ?? {}) } } as T & { platformMetrics: Record<string, number> };
  for (const s of sorted.slice(1)) {
    for (const f of METRIC_FIELDS) if (out[f] == null && s[f] != null) (out as MetricSnapshot)[f] = s[f];
    for (const [k, v] of Object.entries(s.platformMetrics ?? {})) if (out.platformMetrics[k] == null) out.platformMetrics[k] = v;
  }
  return out;
}

/** The snapshot to report: the latest one captured. */
export function latestSnapshot<T extends { capturedOn: IsoDate }>(snaps: T[]): T | null {
  return snaps.reduce<T | null>((best, s) => (!best || s.capturedOn > best.capturedOn ? s : best), null);
}

/** Calendar grid: the weeks (Mon–Sun) covering a month. */
export function monthGrid(month: IsoDate, weekStartsOn: 0 | 1 = 1): IsoDate[][] {
  const first = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  const offset = (first.getUTCDay() - weekStartsOn + 7) % 7;
  const start = new Date(first);
  start.setUTCDate(1 - offset);
  const weeks: IsoDate[][] = [];
  const cursor = new Date(start);
  do {
    const week: IsoDate[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getUTCMonth() === first.getUTCMonth());
  return weeks;
}

/** Extra metrics only one platform reports, stored in content_metrics.platform_metrics. */
export const PLATFORM_EXTRA_METRICS: Record<Platform, readonly { key: string; label: string; percent?: boolean }[]> = {
  instagram: [
    { key: "nonFollowerReachPct", label: "Reach from non-followers (%)", percent: true },
    { key: "replays", label: "Replays" },
    { key: "sends", label: "Sends (DM shares)" },
  ],
  youtube: [
    { key: "impressionsCtrPct", label: "Impressions click-through rate (%)", percent: true },
    { key: "subscribersLost", label: "Subscribers lost" },
    { key: "endScreenClicks", label: "End-screen clicks" },
  ],
  linkedin: [
    { key: "sends", label: "Sends" },
    { key: "clickThroughRatePct", label: "Click-through rate (%)", percent: true },
    { key: "profileViewsFromPost", label: "Profile views from this post" },
  ],
};
export const ALL_EXTRA_KEYS = [...new Set(Object.values(PLATFORM_EXTRA_METRICS).flatMap((l) => l.map((m) => m.key)))];
