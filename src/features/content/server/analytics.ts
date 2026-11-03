/**
 * Content performance analytics: aggregates recorded snapshots, audience
 * snapshots and sales records attributed to content.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import { audienceSnapshots, contentItems, contentMetrics, contentPillars, deals, prospects } from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import { FORMAT_LABELS, mergeLatest, PLATFORM_LABELS, type Platform } from "@/lib/domain/content";
import {
  audienceGrowth,
  groupBy,
  insights,
  itemStats,
  monthlyTrends,
  rankGroups,
  rankItems,
  type AnalyticsItem,
  type ItemSort,
} from "@/lib/domain/content-analytics";
import { addDays } from "@/lib/domain/dates";
import { notFound } from "@/lib/errors";

export const WINDOWS = ["30", "90", "365", "all"] as const;
export type Window = (typeof WINDOWS)[number];

export async function getAnalytics(tx: Tx, q: { window?: Window; platform?: Platform; sort?: ItemSort }) {
  const ws = await requireWorkspace(tx);
  const window = q.window ?? "90";
  const since = window === "all" ? null : addDays(ws.today, -Number(window));
  const where = [isNull(contentItems.archivedAt), isNotNull(contentItems.publishedOn), isNotNull(contentItems.platform)];
  if (since) where.push(gte(contentItems.publishedOn, since));
  if (q.platform) where.push(eq(contentItems.platform, q.platform));
  const rows = await tx.select().from(contentItems).where(and(...where)).orderBy(asc(contentItems.publishedOn));
  const ids = rows.map((r) => r.id);

  const snaps = ids.length ? await tx.select().from(contentMetrics).where(inArray(contentMetrics.itemId, ids)) : [];
  const snapsBy = new Map<string, (typeof snaps)[number][]>();
  for (const s of snaps) snapsBy.set(s.itemId, [...(snapsBy.get(s.itemId) ?? []), s]);
  const latestBy = new Map([...snapsBy.entries()].map(([id, list]) => [id, mergeLatest(list)!]));

  // Attribution: prospects linked to content, and their deals.
  const attributed = ids.length
    ? await tx
        .select({ id: prospects.id, itemId: prospects.contentItemId, createdAt: prospects.createdAt })
        .from(prospects)
        .where(inArray(prospects.contentItemId, ids))
    : [];
  const prospectIds = attributed.map((p) => p.id);
  const dealRows = prospectIds.length
    ? await tx
        .select({ prospectId: deals.prospectId, stage: deals.stage, amount: deals.amount, currency: deals.currency })
        .from(deals)
        .where(inArray(deals.prospectId, prospectIds))
    : [];
  const itemOfProspect = new Map(attributed.map((p) => [p.id, p.itemId!]));

  const items: AnalyticsItem[] = rows.map((r) => {
    const won = { count: 0, byCurrency: {} as Record<string, number> };
    let openDeals = 0;
    for (const d of dealRows) {
      if (itemOfProspect.get(d.prospectId!) !== r.id) continue;
      if (d.stage === "won") {
        won.count += 1;
        won.byCurrency[d.currency] = Math.round(((won.byCurrency[d.currency] ?? 0) + (d.amount ?? 0)) * 100) / 100;
      } else if (d.stage !== "lost") openDeals += 1;
    }
    return {
      id: r.id,
      title: r.title,
      topic: r.topic,
      pillarId: r.pillarId,
      platform: r.platform!,
      format: r.format!,
      publishedOn: r.publishedOn!,
      latest: latestBy.get(r.id) ?? null,
      prospects: attributed.filter((p) => p.itemId === r.id).length,
      won,
      openDeals,
    };
  });

  const pillars = await tx.select().from(contentPillars);
  const pillarName = new Map(pillars.map((p) => [p.id, p.name]));
  const label = <T extends { key: string }>(gs: T[], fn: (k: string) => string) => gs.map((g) => ({ ...g, label: fn(g.key) }));

  const byPillar = label(rankGroups(groupBy(items, (i) => i.pillarId ?? "none")), (k) => (k === "none" ? "No pillar" : (pillarName.get(k) ?? "Unknown")));
  const byFormat = label(rankGroups(groupBy(items, (i) => `${i.platform}:${i.format}`)), (k) => {
    const [p, f] = k.split(":") as [Platform, keyof typeof FORMAT_LABELS];
    return `${PLATFORM_LABELS[p]} ${FORMAT_LABELS[f]}`;
  });
  const topicLabels = new Map<string, string>();
  for (const i of items) if (i.topic) topicLabels.set(i.topic.trim().toLowerCase(), topicLabels.get(i.topic.trim().toLowerCase()) ?? i.topic.trim());
  const byTopic = label(rankGroups(groupBy(items, (i) => (i.topic ? i.topic.trim().toLowerCase() : null))), (k) => topicLabels.get(k) ?? k).slice(0, 15);
  const byPlatform = label(rankGroups(groupBy(items, (i) => i.platform)), (k) => PLATFORM_LABELS[k as Platform]);
  const totals = groupBy(items, () => "all")[0] ?? null;

  const prospectsByMonth = new Map<string, number>();
  for (const p of attributed) {
    const m = `${p.createdAt.toISOString().slice(0, 7)}-01`;
    prospectsByMonth.set(m, (prospectsByMonth.get(m) ?? 0) + 1);
  }

  const audienceWhere = [];
  if (q.platform) audienceWhere.push(eq(audienceSnapshots.platform, q.platform));
  const audienceRows = await tx
    .select()
    .from(audienceSnapshots)
    .where(audienceWhere.length ? and(...audienceWhere) : undefined)
    .orderBy(asc(audienceSnapshots.capturedOn));
  // Keep the last snapshot before the window as the baseline.
  const inWindow = audienceRows.filter((a) => !since || a.capturedOn >= since);
  const baselines = since
    ? [...new Set(audienceRows.map((a) => a.platform))].flatMap((p) => audienceRows.filter((a) => a.platform === p && a.capturedOn < since).slice(-1))
    : [];
  const audience = [...baselines, ...inWindow];

  const sort = q.sort ?? "business";
  return {
    today: ws.today,
    window,
    since,
    platform: q.platform ?? null,
    sort,
    totals,
    totalViews: items.reduce((a, i) => a + (itemStats(i.latest).views ?? 0), 0),
    measuredCount: items.filter((i) => i.latest).length,
    unmeasured: items.filter((i) => !i.latest).map((i) => ({ id: i.id, title: i.title, publishedOn: i.publishedOn })),
    byPillar,
    byFormat,
    byTopic,
    byPlatform,
    topItems: rankItems(items, sort)
      .slice(0, 15)
      .map((r) => ({ ...r, pillar: r.item.pillarId ? (pillarName.get(r.item.pillarId) ?? null) : null })),
    trends: monthlyTrends(items, prospectsByMonth),
    audience,
    audienceGrowth: audienceGrowth(audience),
    insights: insights({ pillars: byPillar, formats: byFormat, items }),
  };
}

export async function recordAudience(tx: Tx, input: { platform: Platform; capturedOn: string | null; followers: number; notes: string | null }) {
  const ws = await requireWorkspace(tx);
  const values = { ...input, capturedOn: input.capturedOn ?? ws.today };
  const [row] = await tx
    .insert(audienceSnapshots)
    .values(values)
    .onConflictDoUpdate({ target: [audienceSnapshots.userId, audienceSnapshots.platform, audienceSnapshots.capturedOn], set: { followers: values.followers, notes: values.notes } })
    .returning();
  return row;
}

export async function deleteAudience(tx: Tx, id: string) {
  const [row] = await tx.delete(audienceSnapshots).where(eq(audienceSnapshots.id, id)).returning();
  if (!row) throw notFound("Audience snapshot");
}

