/**
 * Content performance analytics. Everything is aggregated from recorded
 * snapshots and attributed sales records; nothing is estimated. Small samples
 * are flagged instead of being ranked as if they were conclusive.
 */
import { engagement, type Format, type MetricSnapshot, type Platform } from "./content";
import type { IsoDate } from "./dates";

export const MIN_SAMPLE = 3;

export type AnalyticsItem = {
  id: string;
  title: string;
  topic: string | null;
  pillarId: string | null;
  platform: Platform;
  format: Format;
  publishedOn: IsoDate;
  latest: MetricSnapshot | null;
  /** Prospects linked to this item in the sales module. */
  prospects: number;
  /** Won deals from those prospects, per currency. */
  won: { count: number; byCurrency: Record<string, number> };
  openDeals: number;
};

export type ItemStats = {
  audience: number | null;
  audienceBase: "reach" | "views" | "impressions" | null;
  engagement: number | null;
  engagementRate: number | null;
  /** Saves + shares + comments: people keeping, recommending or talking. A proxy for trust, not a measurement of it. */
  trustSignals: number | null;
  trustRate: number | null;
  views: number | null;
  followersGained: number | null;
  profileVisits: number | null;
  websiteClicks: number | null;
  reportedLeads: number | null;
  reportedSales: number | null;
  watchTimeMinutes: number | null;
  avgRetentionPct: number | null;
  completionRatePct: number | null;
};

const sumOrNull = (xs: (number | null)[]) => (xs.some((x) => x != null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null);

export function itemStats(m: MetricSnapshot | null): ItemStats {
  if (!m) {
    return {
      audience: null,
      audienceBase: null,
      engagement: null,
      engagementRate: null,
      trustSignals: null,
      trustRate: null,
      views: null,
      followersGained: null,
      profileVisits: null,
      websiteClicks: null,
      reportedLeads: null,
      reportedSales: null,
      watchTimeMinutes: null,
      avgRetentionPct: null,
      completionRatePct: null,
    };
  }
  const base = (["reach", "views", "impressions"] as const).find((k) => m[k] != null && (m[k] as number) > 0) ?? null;
  const audience = base ? (m[base] as number) : null;
  const e = engagement(m);
  const trust = sumOrNull([m.saves, m.shares, m.comments]);
  return {
    audience,
    audienceBase: base,
    engagement: e,
    engagementRate: e != null && audience ? e / audience : null,
    trustSignals: trust,
    trustRate: trust != null && audience ? trust / audience : null,
    views: m.views,
    followersGained: m.followersGained,
    profileVisits: m.profileVisits,
    websiteClicks: m.websiteClicks,
    reportedLeads: m.leads,
    reportedSales: m.salesAmount,
    watchTimeMinutes: m.watchTimeMinutes,
    avgRetentionPct: m.avgRetentionPct,
    completionRatePct: m.completionRatePct,
  };
}

export type GroupStats = {
  key: string;
  items: number;
  measured: number;
  audience: number;
  engagementRate: number | null;
  trustRate: number | null;
  reportedLeads: number;
  leadsPerItem: number | null;
  prospects: number;
  openDeals: number;
  wonDeals: number;
  wonByCurrency: Record<string, number>;
  followersGained: number;
  smallSample: boolean;
};

/** Aggregates are weighted: total engagement ÷ total audience, not an average of rates. */
export function groupBy(items: AnalyticsItem[], keyOf: (i: AnalyticsItem) => string | null): GroupStats[] {
  const groups = new Map<string, AnalyticsItem[]>();
  for (const i of items) {
    const k = keyOf(i);
    if (k == null) continue;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const stats = list.map((i) => itemStats(i.latest));
    const measured = stats.filter((s) => s.audience != null);
    const audience = measured.reduce((a, s) => a + (s.audience ?? 0), 0);
    const eng = measured.reduce((a, s) => a + (s.engagement ?? 0), 0);
    const trust = measured.reduce((a, s) => a + (s.trustSignals ?? 0), 0);
    const reportedLeads = stats.reduce((a, s) => a + (s.reportedLeads ?? 0), 0);
    const wonByCurrency: Record<string, number> = {};
    for (const i of list) for (const [c, v] of Object.entries(i.won.byCurrency)) wonByCurrency[c] = Math.round(((wonByCurrency[c] ?? 0) + v) * 100) / 100;
    return {
      key,
      items: list.length,
      measured: measured.length,
      audience,
      engagementRate: audience ? eng / audience : null,
      trustRate: audience ? trust / audience : null,
      reportedLeads,
      leadsPerItem: list.length ? (reportedLeads + list.reduce((a, i) => a + i.prospects, 0)) / list.length : null,
      prospects: list.reduce((a, i) => a + i.prospects, 0),
      openDeals: list.reduce((a, i) => a + i.openDeals, 0),
      wonDeals: list.reduce((a, i) => a + i.won.count, 0),
      wonByCurrency,
      followersGained: stats.reduce((a, s) => a + (s.followersGained ?? 0), 0),
      smallSample: measured.length < MIN_SAMPLE,
    };
  });
}

/** Business value first: won deals, then prospects and leads, then trust, then reach. */
export function rankGroups(groups: GroupStats[]): GroupStats[] {
  const score = (g: GroupStats) => [g.wonDeals, g.prospects + g.reportedLeads, g.trustRate ?? -1, g.audience];
  return [...groups].sort((a, b) => {
    if (a.smallSample !== b.smallSample) return a.smallSample ? 1 : -1;
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i];
    return a.key.localeCompare(b.key);
  });
}

export const ITEM_SORTS = ["business", "leads", "trust", "engagement", "views", "followers"] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];
export const ITEM_SORT_LABELS: Record<ItemSort, string> = {
  business: "Business value",
  leads: "Leads",
  trust: "Trust signals",
  engagement: "Engagement rate",
  views: "Views",
  followers: "Followers gained",
};

export function rankItems(items: AnalyticsItem[], sort: ItemSort) {
  const rows = items.map((i) => ({ item: i, stats: itemStats(i.latest) }));
  const val = (r: (typeof rows)[number]): number[] => {
    const s = r.stats;
    switch (sort) {
      case "business":
        return [r.item.won.count, r.item.prospects + (s.reportedLeads ?? 0), s.trustRate ?? -1];
      case "leads":
        return [r.item.prospects + (s.reportedLeads ?? 0), r.item.won.count];
      case "trust":
        return [s.trustRate ?? -1, s.trustSignals ?? -1];
      case "engagement":
        return [s.engagementRate ?? -1];
      case "views":
        return [s.views ?? s.audience ?? -1];
      case "followers":
        return [s.followersGained ?? -1];
    }
  };
  return rows.sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return vb[i] - va[i];
    return b.item.publishedOn.localeCompare(a.item.publishedOn);
  });
}

export type MonthTrend = {
  month: IsoDate;
  published: number;
  engagementRate: number | null;
  trustRate: number | null;
  reportedLeads: number;
  prospects: number;
};

/** Trends by publishing month. */
export function monthlyTrends(items: AnalyticsItem[], prospectsByMonth: Map<IsoDate, number>): MonthTrend[] {
  const months = new Set<IsoDate>([...items.map((i) => `${i.publishedOn.slice(0, 7)}-01`), ...prospectsByMonth.keys()]);
  return [...months].sort().map((month) => {
    const list = items.filter((i) => i.publishedOn.startsWith(month.slice(0, 7)));
    const g = groupBy(list, () => "all")[0];
    return {
      month,
      published: list.length,
      engagementRate: g?.engagementRate ?? null,
      trustRate: g?.trustRate ?? null,
      reportedLeads: g?.reportedLeads ?? 0,
      prospects: prospectsByMonth.get(month) ?? 0,
    };
  });
}

/** Net follower change per platform between its first and last snapshot in the window. */
export function audienceGrowth(snaps: { platform: Platform; capturedOn: IsoDate; followers: number }[]) {
  const byPlatform = new Map<Platform, typeof snaps>();
  for (const s of [...snaps].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn))) byPlatform.set(s.platform, [...(byPlatform.get(s.platform) ?? []), s]);
  return [...byPlatform.entries()].map(([platform, list]) => ({
    platform,
    first: list[0],
    last: list.at(-1)!,
    change: list.at(-1)!.followers - list[0].followers,
    pct: list[0].followers > 0 ? (list.at(-1)!.followers - list[0].followers) / list[0].followers : null,
    points: list.length,
  }));
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Plain statements backed by the numbers; only made when samples allow. */
export function insights(input: { pillars: (GroupStats & { label: string })[]; formats: (GroupStats & { label: string })[]; items: AnalyticsItem[] }): string[] {
  const out: string[] = [];
  const solid = (gs: (GroupStats & { label: string })[]) => gs.filter((g) => !g.smallSample);
  const p = solid(input.pillars);
  if (p.length >= 2) {
    const byLeads = [...p].sort((a, b) => (b.leadsPerItem ?? 0) - (a.leadsPerItem ?? 0));
    if ((byLeads[0].leadsPerItem ?? 0) > 0) {
      out.push(`${byLeads[0].label} brings the most leads per piece (${(byLeads[0].leadsPerItem ?? 0).toFixed(1)} over ${byLeads[0].items} items).`);
    }
    const byTrust = [...p].filter((g) => g.trustRate != null).sort((a, b) => (b.trustRate ?? 0) - (a.trustRate ?? 0));
    if (byTrust.length >= 2) out.push(`${byTrust[0].label} earns the most saves, shares and comments per viewer (${pct(byTrust[0].trustRate!)} vs ${pct(byTrust.at(-1)!.trustRate!)} for ${byTrust.at(-1)!.label}).`);
    const reachTop = [...p].sort((a, b) => b.audience - a.audience)[0];
    if (byLeads[0].key !== reachTop.key && (byLeads[0].leadsPerItem ?? 0) > (reachTop.leadsPerItem ?? 0)) {
      out.push(`${reachTop.label} reaches the most people, but ${byLeads[0].label} turns attention into more leads.`);
    }
  }
  const f = solid(input.formats).filter((g) => g.trustRate != null);
  if (f.length >= 2) {
    const best = [...f].sort((a, b) => (b.trustRate ?? 0) - (a.trustRate ?? 0))[0];
    out.push(`Best format for depth of engagement: ${best.label} (${pct(best.trustRate!)} trust signals per viewer, ${best.measured} measured).`);
  }
  const withFollowers = input.items.filter((i) => (i.latest?.followersGained ?? 0) > 0);
  const followerTop = [...withFollowers].sort((a, b) => (b.latest!.followersGained ?? 0) - (a.latest!.followersGained ?? 0))[0];
  if (followerTop && followerTop.prospects + (followerTop.latest?.leads ?? 0) === 0 && withFollowers.length >= MIN_SAMPLE) {
    out.push(`"${followerTop.title}" gained the most followers but produced no leads: followers alone aren't business.`);
  }
  if (!out.length) out.push(`Not enough measured content yet for reliable comparisons. Record metrics for at least ${MIN_SAMPLE} published items per pillar.`);
  return out;
}
