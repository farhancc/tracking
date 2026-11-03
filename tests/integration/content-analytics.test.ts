import { afterAll, describe, expect, it } from "vitest";
import { itemCreateSchema, metricSchema } from "../../src/features/content/schemas";
import { getAnalytics, recordAudience } from "../../src/features/content/server/analytics";
import { createItem, getItem, listPillars, recordMetrics } from "../../src/features/content/server/service";
import { dealCreateSchema, dealUpdateSchema, prospectCreateSchema } from "../../src/features/sales/schemas";
import { createDeal, createProspect, updateDeal } from "../../src/features/sales/server/service";
import { addDays, todayIn } from "../../src/lib/domain/dates";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());
const today = todayIn("UTC");

describe("content analytics", () => {
  it("ranks pillars by leads and won deals, not reach, and tracks audience growth", async () => {
    const o = await h.newOwner();
    const pillars = await h.as(o.userId, (tx) => listPillars(tx));
    const sales = pillars.find((p) => p.name === "Practical sales")!;
    const tech = pillars.find((p) => p.name === "Technology and product building")!;
    const publish = async (title: string, pillarId: string, platform: "instagram" | "youtube", format: "reel" | "short", m: Record<string, unknown>, daysAgo = 10) => {
      const it = await h.as(o.userId, (tx) =>
        createItem(tx, itemCreateSchema.parse({ title, pillarId, platform, format, status: "published", publishedOn: addDays(today, -daysAgo), topic: title.split(" ")[0] })),
      );
      await h.as(o.userId, (tx) => recordMetrics(tx, it.id, metricSchema.parse({ capturedOn: today, ...m }) as Parameters<typeof recordMetrics>[2]));
      return it;
    };
    const s1 = await publish("Pricing objection", sales.id, "instagram", "reel", { reach: 2000, likes: 100, saves: 120, shares: 30, comments: 25, leads: 2, x_nonFollowerReachPct: 61, x_impressionsCtrPct: 9 });
    await publish("Pricing anchor", sales.id, "instagram", "reel", { reach: 1500, likes: 60, saves: 70, leads: 1 });
    await publish("Discovery calls", sales.id, "instagram", "reel", { reach: 1800, likes: 70, saves: 40, comments: 12 });
    for (const [i, reach] of [80000, 60000, 50000].entries()) {
      await publish(`Tech demo ${i}`, tech.id, "youtube", "short", { views: reach, likes: reach / 50, followersGained: 400 });
    }
    // An old item outside the 90-day window.
    await publish("Old pricing post", sales.id, "instagram", "reel", { reach: 999999, likes: 1 }, 200);

    // Platform extras: only the item's own platform's keys are kept.
    expect((await h.as(o.userId, (tx) => getItem(tx, s1.id))).latest!.snapshot.platformMetrics).toEqual({ nonFollowerReachPct: 61 });

    // Two prospects came from the pricing post; one deal won.
    const p1 = await h.as(o.userId, (tx) => createProspect(tx, prospectCreateSchema.parse({ name: "Priya", contentItemId: s1.id })));
    await h.as(o.userId, (tx) => createProspect(tx, prospectCreateSchema.parse({ name: "Dan", contentItemId: s1.id })));
    const deal = await h.as(o.userId, (tx) => createDeal(tx, dealCreateSchema.parse({ prospectId: p1.id, title: "Coaching", amount: 1200, currency: "USD" })));
    await h.as(o.userId, (tx) => updateDeal(tx, deal.id, dealUpdateSchema.parse({ stage: "won", closedOn: today })));

    await h.as(o.userId, (tx) => recordAudience(tx, { platform: "instagram", followers: 1000, capturedOn: addDays(today, -120), notes: null }));
    await h.as(o.userId, (tx) => recordAudience(tx, { platform: "instagram", followers: 1080, capturedOn: addDays(today, -30), notes: null }));
    await h.as(o.userId, (tx) => recordAudience(tx, { platform: "instagram", followers: 1200, capturedOn: today, notes: null }));
    await rejectsWith(h.as(o.userId, (tx) => recordAudience(tx, { platform: "youtube", followers: 5, capturedOn: addDays(today, 1), notes: null })), { detail: "occurred_in_future" });

    const a = await h.as(o.userId, (tx) => getAnalytics(tx, { window: "90" }));
    expect(a.totals?.items).toBe(6);
    expect(a.byPillar[0]).toMatchObject({ label: "Practical sales", prospects: 2, wonDeals: 1, wonByCurrency: { USD: 1200 }, reportedLeads: 3, smallSample: false });
    expect(a.byPillar[1].label).toBe("Technology and product building");
    expect(a.byPillar[1].audience).toBeGreaterThan(a.byPillar[0].audience);
    expect(a.topItems[0].item.title).toBe("Pricing objection");
    expect(a.byFormat.map((f) => f.label)).toEqual(["Instagram Reel", "YouTube Short"]);
    expect(a.insights.join(" ")).toMatch(/Practical sales brings the most leads per piece/);
    expect(a.insights.join(" ")).toMatch(/Technology and product building reaches the most people, but Practical sales turns attention into more leads/);
    // Baseline before the window + snapshots in it.
    expect(a.audienceGrowth).toEqual([expect.objectContaining({ platform: "instagram", change: 200, points: 3 })]);

    const followers = await h.as(o.userId, (tx) => getAnalytics(tx, { window: "90", sort: "followers" }));
    expect(followers.topItems[0].item.title).toMatch(/^Tech demo/);
    const all = await h.as(o.userId, (tx) => getAnalytics(tx, { window: "all" }));
    expect(all.totals?.items).toBe(7);
    const yt = await h.as(o.userId, (tx) => getAnalytics(tx, { window: "90", platform: "youtube" }));
    expect(yt.byPillar.map((p) => p.label)).toEqual(["Technology and product building"]);

    // A prospect can't be linked to another owner's content.
    const other = await h.newOwner();
    await expect(h.as(other.userId, (tx) => createProspect(tx, prospectCreateSchema.parse({ name: "X", contentItemId: s1.id })))).rejects.toBeTruthy();
  });
});
