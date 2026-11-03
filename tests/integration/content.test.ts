import { afterAll, describe, expect, it } from "vitest";
import { itemCreateSchema, metricSchema } from "../../src/features/content/schemas";
import {
  addSource,
  advanceItem,
  createItem,
  getBrand,
  getCalendar,
  getItem,
  getOverview,
  listItems,
  listPillars,
  recordMetrics,
  repurposeItem,
  setBrand,
  updateItem,
} from "../../src/features/content/server/service";
import { addDays, todayIn } from "../../src/lib/domain/dates";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());
const today = todayIn("UTC");
const metric = (body: Record<string, unknown>) => metricSchema.parse(body) as Parameters<typeof recordMetrics>[2];

describe("content management", () => {
  it("starts with the positioning and seven pillars, all editable", async () => {
    const o = await h.newOwner();
    const brand = await h.as(o.userId, (tx) => getBrand(tx));
    expect(brand.positioning).toMatch(/^I build technology products/);
    const pillars = await h.as(o.userId, (tx) => listPillars(tx));
    expect(pillars.map((p) => p.name)).toEqual([
      "Communication",
      "Sales psychology",
      "Persuasion and negotiation",
      "Human behaviour",
      "Practical sales",
      "Entrepreneurship",
      "Technology and product building",
    ]);
    await h.as(o.userId, (tx) => setBrand(tx, { positioning: "I help founders sell.", audience: "B2B founders" }));
    expect((await h.as(o.userId, (tx) => getBrand(tx))).positioning).toBe("I help founders sell.");
    // Seeding is idempotent.
    expect((await h.as(o.userId, (tx) => listPillars(tx))).length).toBe(7);
  });

  it("moves an item through the pipeline with actual dates and checks", async () => {
    const o = await h.newOwner();
    const pillar = (await h.as(o.userId, (tx) => listPillars(tx)))[1];
    const idea = await h.as(o.userId, (tx) => createItem(tx, itemCreateSchema.parse({ title: "Why discounts kill deals", pillarId: pillar.id, topic: "Price anchoring" })));
    expect(idea).toMatchObject({ status: "idea", platform: null });
    expect((await h.as(o.userId, (tx) => listItems(tx, { ideasOnly: true }))).map((i) => i.title)).toEqual(["Why discounts kill deals"]);

    await h.as(o.userId, (tx) => advanceItem(tx, idea.id)); // research
    await expect(h.as(o.userId, (tx) => advanceItem(tx, idea.id))).rejects.toMatchObject({ code: "validation_failed" }); // script needs a platform
    await expect(h.as(o.userId, (tx) => updateItem(tx, idea.id, { platform: "linkedin", format: "reel" }))).rejects.toBeTruthy();
    await h.as(o.userId, (tx) => updateItem(tx, idea.id, { platform: "instagram", format: "reel", script: "Hook: You lost the deal when you said 10% off." }));
    await h.as(o.userId, (tx) => addSource(tx, idea.id, { title: "Thinking, Fast and Slow", url: null, notes: "Anchoring chapter" }));
    await h.as(o.userId, (tx) => advanceItem(tx, idea.id)); // script
    await h.as(o.userId, (tx) => advanceItem(tx, idea.id)); // recording
    const editing = await h.as(o.userId, (tx) => advanceItem(tx, idea.id));
    expect(editing).toMatchObject({ status: "editing", recordedOn: today });
    await expect(h.as(o.userId, (tx) => advanceItem(tx, idea.id))).rejects.toMatchObject({ code: "validation_failed" }); // scheduled needs a date
    await h.as(o.userId, (tx) => updateItem(tx, idea.id, { status: "scheduled", scheduledOn: addDays(today, 3) }));
    const cal = await h.as(o.userId, (tx) => getCalendar(tx, addDays(today, 3).slice(0, 7)));
    expect(cal.entries.map((e) => [e.kind, e.date])).toContainEqual(["scheduled", addDays(today, 3)]);

    // Metrics need a published item.
    await rejectsWith(h.as(o.userId, (tx) => recordMetrics(tx, idea.id, metric({ views: 10 }))), { detail: "not_published" });
    await rejectsWith(h.as(o.userId, (tx) => updateItem(tx, idea.id, { status: "published", publishedOn: addDays(today, 1) })), { detail: "occurred_in_future" });
    const published = await h.as(o.userId, (tx) => updateItem(tx, idea.id, { status: "published", publishedOn: addDays(today, -2) }));
    expect(published.publishedOn).toBe(addDays(today, -2));

    // The review needs numbers and a lesson.
    await expect(h.as(o.userId, (tx) => updateItem(tx, idea.id, { status: "reviewed" }))).rejects.toMatchObject({ code: "validation_failed" });
    await rejectsWith(h.as(o.userId, (tx) => updateItem(tx, idea.id, { status: "reviewed", reviewNotes: "x" })), { detail: "metrics_required" });
    await rejectsWith(h.as(o.userId, (tx) => recordMetrics(tx, idea.id, metric({ views: 10, capturedOn: addDays(today, -3) }))), { detail: "captured_before_publish" });
    await expect(h.as(o.userId, (tx) => recordMetrics(tx, idea.id, metric({})))).rejects.toBeTruthy();
    await h.as(o.userId, (tx) => recordMetrics(tx, idea.id, metric({ views: 1200, reach: 900, likes: 80, comments: 12, shares: 9, saves: 40, leads: 2, capturedOn: addDays(today, -1) })));
    await h.as(o.userId, (tx) => recordMetrics(tx, idea.id, metric({ views: 2000, reach: 1500, likes: 120, comments: 20, shares: 15, saves: 65, leads: 3 })));
    await h.as(o.userId, (tx) => recordMetrics(tx, idea.id, metric({ views: 2100, reach: 1500, likes: 120, comments: 20, shares: 15, saves: 65, leads: 3 })));
    const detail = await h.as(o.userId, (tx) => getItem(tx, idea.id));
    expect(detail.metrics.length).toBe(2);
    expect(detail.latest).toMatchObject({ engagement: 220, engagementRate: { base: "reach" } });
    expect(detail.latest!.engagementRate!.rate).toBeCloseTo(220 / 1500);
    await rejectsWith(h.as(o.userId, (tx) => updateItem(tx, idea.id, { status: "editing" })), { detail: "metrics_exist" });
    const reviewed = await h.as(o.userId, (tx) => updateItem(tx, idea.id, { status: "reviewed", reviewNotes: "Saves were high: people keep money lessons." }));
    expect(reviewed.status).toBe("reviewed");

    // Repurpose for LinkedIn keeps script and sources.
    const li = await h.as(o.userId, (tx) => repurposeItem(tx, idea.id, { platform: "linkedin", format: "document", title: null }));
    const liDetail = await h.as(o.userId, (tx) => getItem(tx, li.id));
    expect(liDetail).toMatchObject({ item: { status: "script", platform: "linkedin", script: published.script }, original: { id: idea.id } });
    expect(liDetail.sources.map((s) => s.title)).toEqual(["Thinking, Fast and Slow"]);

    const ov = await h.as(o.userId, (tx) => getOverview(tx));
    expect(ov.counts).toMatchObject({ reviewed: 1, script: 1 });
    expect(ov.pillarMix.find((p) => p.pillar.id === pillar.id)).toMatchObject({ published90: 1, inProgress: 1 });

    const other = await h.newOwner();
    expect(await h.as(other.userId, (tx) => listItems(tx, {}))).toEqual([]);
    await expect(h.as(other.userId, (tx) => getItem(tx, idea.id))).rejects.toMatchObject({ status: 404 });
  });
});
