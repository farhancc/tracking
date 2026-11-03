import { describe, expect, it } from "vitest";
import type { MetricSnapshot } from "./content";
import { audienceGrowth, groupBy, insights, itemStats, monthlyTrends, rankGroups, rankItems, type AnalyticsItem } from "./content-analytics";

const snap = (over: Partial<MetricSnapshot>): MetricSnapshot => ({
  capturedOn: "2026-10-20",
  views: null,
  reach: null,
  impressions: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  watchTimeMinutes: null,
  avgViewSeconds: null,
  avgRetentionPct: null,
  completionRatePct: null,
  profileVisits: null,
  followersGained: null,
  websiteClicks: null,
  leads: null,
  salesCount: null,
  salesAmount: null,
  ...over,
});
let n = 0;
const item = (over: Partial<AnalyticsItem>): AnalyticsItem => ({
  id: `i${++n}`,
  title: `Item ${n}`,
  topic: null,
  pillarId: "sales",
  platform: "instagram",
  format: "reel",
  publishedOn: "2026-10-01",
  latest: null,
  prospects: 0,
  won: { count: 0, byCurrency: {} },
  openDeals: 0,
  ...over,
});

describe("content analytics", () => {
  it("computes per-item engagement and trust signals from what was recorded", () => {
    const s = itemStats(snap({ reach: 1000, views: 4000, likes: 50, comments: 10, shares: 5, saves: 25 }));
    expect(s).toMatchObject({ audience: 1000, audienceBase: "reach", engagement: 90, trustSignals: 40 });
    expect(s.engagementRate).toBeCloseTo(0.09);
    expect(s.trustRate).toBeCloseTo(0.04);
    expect(itemStats(null).audience).toBeNull();
    expect(itemStats(snap({ likes: 3 })).engagementRate).toBeNull();
  });

  it("weights group rates by audience, flags small samples and ranks by business value", () => {
    const items = [
      item({ pillarId: "sales", latest: snap({ reach: 1000, likes: 100, saves: 50 }), prospects: 2, won: { count: 1, byCurrency: { USD: 500 } } }),
      item({ pillarId: "sales", latest: snap({ reach: 9000, likes: 90, saves: 10 }) }),
      item({ pillarId: "sales", latest: snap({ reach: 1000, likes: 10, leads: 3 }) }),
      item({ pillarId: "tech", latest: snap({ reach: 50000, likes: 2000, saves: 100, followersGained: 900 }) }),
      item({ pillarId: "tech", latest: snap({ reach: 40000, likes: 1500 }) }),
      item({ pillarId: "tech", latest: snap({ reach: 30000, likes: 900 }) }),
      item({ pillarId: "comm", latest: snap({ reach: 10, likes: 10 }) }),
    ];
    const groups = groupBy(items, (i) => i.pillarId);
    const sales = groups.find((g) => g.key === "sales")!;
    expect(sales.engagementRate).toBeCloseTo((150 + 100 + 10) / 11000);
    expect(sales).toMatchObject({ items: 3, prospects: 2, reportedLeads: 3, wonDeals: 1, wonByCurrency: { USD: 500 }, smallSample: false });
    expect(sales.leadsPerItem).toBeCloseTo(5 / 3);
    expect(groups.find((g) => g.key === "comm")!.smallSample).toBe(true);
    // Huge reach doesn't beat leads and won deals.
    expect(rankGroups(groups).map((g) => g.key)).toEqual(["sales", "tech", "comm"]);

    expect(rankItems(items, "business")[0].item.id).toBe(items[0].id);
    expect(rankItems(items, "views")[0].item.id).toBe(items[3].id);
    expect(rankItems(items, "leads")[0].item.id).toBe(items[2].id);

    const text = insights({
      pillars: groups.map((g) => ({ ...g, label: g.key })),
      formats: groupBy(items, (i) => i.format).map((g) => ({ ...g, label: g.key })),
      items,
    });
    expect(text.join(" ")).toMatch(/sales brings the most leads per piece \(1\.7 over 3 items\)/);
    expect(text.join(" ")).toMatch(/tech reaches the most people, but sales turns attention into more leads/);
  });

  it("refuses to draw conclusions from too little data", () => {
    const text = insights({ pillars: [], formats: [], items: [] });
    expect(text[0]).toMatch(/Not enough measured content/);
  });

  it("builds monthly trends and audience growth", () => {
    const t = monthlyTrends(
      [item({ publishedOn: "2026-09-10", latest: snap({ reach: 100, likes: 10, leads: 1 }) }), item({ publishedOn: "2026-10-02", latest: snap({ reach: 100, saves: 20 }) })],
      new Map([["2026-10-01", 2]]),
    );
    expect(t.map((m) => [m.month, m.published, m.reportedLeads, m.prospects])).toEqual([
      ["2026-09-01", 1, 1, 0],
      ["2026-10-01", 1, 0, 2],
    ]);
    expect(t[1].trustRate).toBeCloseTo(0.2);
    const g = audienceGrowth([
      { platform: "youtube", capturedOn: "2026-10-01", followers: 1000 },
      { platform: "youtube", capturedOn: "2026-11-01", followers: 1150 },
      { platform: "instagram", capturedOn: "2026-11-01", followers: 400 },
    ]);
    expect(g.find((x) => x.platform === "youtube")).toMatchObject({ change: 150, pct: 0.15, points: 2 });
    expect(g.find((x) => x.platform === "instagram")).toMatchObject({ change: 0, points: 1 });
  });
});
