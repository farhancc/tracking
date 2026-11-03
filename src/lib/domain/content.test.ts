import { describe, expect, it } from "vitest";
import { engagement, engagementRate, isFormatFor, latestSnapshot, monthGrid, nextStatus, needsPlatform, type MetricSnapshot } from "./content";

const snap = (over: Partial<MetricSnapshot>): MetricSnapshot => ({
  capturedOn: "2026-10-10",
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

describe("content domain", () => {
  it("knows the pipeline and platform formats", () => {
    expect(nextStatus("idea")).toBe("research");
    expect(nextStatus("published")).toBe("reviewed");
    expect(nextStatus("reviewed")).toBeNull();
    expect(needsPlatform("research")).toBe(false);
    expect(needsPlatform("script")).toBe(true);
    expect(isFormatFor("youtube", "short")).toBe(true);
    expect(isFormatFor("linkedin", "reel")).toBe(false);
  });

  it("computes engagement from recorded counts and names the base", () => {
    expect(engagement(snap({}))).toBeNull();
    expect(engagement(snap({ likes: 10, comments: 2, saves: 3 }))).toBe(15);
    expect(engagementRate(snap({ likes: 10, comments: 2, reach: 300, views: 1000 }))).toEqual({ rate: 0.04, base: "reach" });
    expect(engagementRate(snap({ likes: 10, views: 1000 }))).toEqual({ rate: 0.01, base: "views" });
    expect(engagementRate(snap({ likes: 10 }))).toBeNull();
    expect(latestSnapshot([snap({ capturedOn: "2026-10-01" }), snap({ capturedOn: "2026-10-09", views: 5 }), snap({ capturedOn: "2026-10-03" })])?.views).toBe(5);
  });

  it("builds a Monday-first month grid", () => {
    const g = monthGrid("2026-11-01");
    expect(g[0][0]).toBe("2026-10-26");
    expect(g.at(-1)!.at(-1)).toBe("2026-12-06");
    expect(g.flat()).toContain("2026-11-30");
    expect(monthGrid("2026-02-01").length).toBe(5);
    expect(monthGrid("2027-02-01").length).toBe(4);
  });
});
