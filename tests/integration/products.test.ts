import { afterAll, describe, expect, it } from "vitest";
import { productCreateSchema } from "../../src/features/products/schemas";
import { createItem, createProduct, deleteItem, getPortfolio, getProduct, getReport, updateItem, updateProduct } from "../../src/features/products/server/service";
import { addDays, addMonths, todayIn } from "../../src/lib/domain/dates";
import { monthOf } from "../../src/lib/domain/products";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());

// Dates relative to the real clock: the owner's "today" is the database's today.
const today = todayIn("UTC");
const month = (k: number) => addMonths(monthOf(today), k);

const product = (over: Record<string, unknown> = {}) =>
  productCreateSchema.parse({
    name: "InvoiceBot",
    description: "Automates invoice chasing for agencies",
    targetCustomer: "Agencies with 5–50 staff",
    problem: "Late payments",
    valueProposition: "Get paid 10 days faster",
    businessModel: "subscription",
    pricing: "$49/month",
    acquisitionChannels: ["cold email", "SEO"],
    startedOn: addMonths(today, -12),
    ...over,
  });

describe("product portfolio", () => {
  it("records stages, launch dates and currency, isolated per owner", async () => {
    const o = await h.newOwner();
    await expect(h.as(o.userId, (tx) => createProduct(tx, product({ stage: "growth" })))).rejects.toMatchObject({ code: "validation_failed" });
    const p = await h.as(o.userId, (tx) => createProduct(tx, product()));
    expect(p).toMatchObject({ stage: "idea", status: "active", currency: "USD", stageEnteredOn: p.startedOn, launchedOn: null });
    await expect(h.as(o.userId, (tx) => createProduct(tx, product({ startedOn: addDays(today, 1) })))).rejects.toBeTruthy();

    // Skipping validation needs an explicit, reasoned acknowledgement.
    await expect(h.as(o.userId, (tx) => updateProduct(tx, p.id, { stage: "launch" }))).rejects.toMatchObject({ code: "validation_required", status: 409 });
    await expect(h.as(o.userId, (tx) => updateProduct(tx, p.id, { stage: "launch", acknowledgeUnvalidated: true }))).rejects.toMatchObject({ code: "validation_failed" });
    const launched = await h.as(o.userId, (tx) => updateProduct(tx, p.id, { stage: "launch", acknowledgeUnvalidated: true, statusNote: "Already selling it offline" }));
    expect(launched).toMatchObject({ stage: "launch", launchedOn: today, stageEnteredOn: today });
    await expect(h.as(o.userId, (tx) => updateProduct(tx, p.id, { launchedOn: null }))).rejects.toMatchObject({ code: "validation_failed" });
    const detail = await h.as(o.userId, (tx) => getProduct(tx, p.id));
    expect(detail.stageEvents.map((e) => [e.fromStage, e.toStage])).toEqual([
      [null, "idea"],
      ["idea", "launch"],
    ]);

    // Currency is fixed once money is recorded.
    await h.as(o.userId, (tx) => updateProduct(tx, p.id, { currency: "EUR" }));
    await h.as(o.userId, (tx) => createItem(tx, p.id, "transactions", { category: "subscription", amount: 49, occurredOn: today }));
    await rejectsWith(h.as(o.userId, (tx) => updateProduct(tx, p.id, { currency: "GBP" })), { detail: "currency_locked" });

    const other = await h.newOwner();
    expect((await h.as(other.userId, (tx) => getPortfolio(tx))).items).toEqual([]);
    await expect(h.as(other.userId, (tx) => getProduct(tx, p.id))).rejects.toMatchObject({ status: 404 });
    await expect(h.as(other.userId, (tx) => createItem(tx, p.id, "feedback", { kind: "praise", content: "x" }))).rejects.toMatchObject({ status: 404 });
  });

  it("keeps a revenue/expense ledger and monthly metrics as actuals only", async () => {
    const o = await h.newOwner();
    const p = await h.as(o.userId, (tx) => createProduct(tx, product({ stage: "growth", launchedOn: addMonths(today, -10) })));
    const add = (body: Record<string, unknown>) => h.as(o.userId, (tx) => createItem(tx, p.id, "transactions", body));
    await add({ category: "subscription", amount: 1000, occurredOn: addDays(month(-2), 3) });
    await add({ category: "refund", amount: 49, occurredOn: addDays(month(-2), 9) });
    await add({ category: "hosting", amount: 120.5, occurredOn: addDays(month(-2), 1) });
    await add({ category: "marketing", amount: 300, occurredOn: addDays(month(-1), 4) });
    await add({ category: "subscription", amount: 1100, occurredOn: addDays(month(-1), 3) });
    await rejectsWith(add({ category: "subscription", amount: 10, occurredOn: addDays(today, 1) }), { detail: "occurred_in_future" });
    await expect(add({ category: "subscription", amount: -5 })).rejects.toBeTruthy();

    const report = await h.as(o.userId, (tx) => getReport(tx, p.id, { from: month(-2), to: today }));
    expect(report.months.map((m) => [m.month, m.netRevenue, m.expenses, m.profit])).toEqual([
      [month(-2), 951, 120.5, 830.5],
      [month(-1), 1100, 300, 800],
      [month(0), 0, 0, 0],
    ]);
    expect(report.totals).toMatchObject({ revenue: 2100, refunds: 49, expenses: 420.5, profit: 1630.5 });
    expect(report.byCategory).toMatchObject({ subscription: 2100, refund: 49, hosting: 120.5, marketing: 300 });

    // Metrics: one row per month (recording again corrects it); never a future month.
    const metric = (k: number, mrr: number, active: number, added: number, churned: number) =>
      h.as(o.userId, (tx) => createItem(tx, p.id, "metrics", { month: month(k), mrr, activeCustomers: active, newCustomers: added, churnedCustomers: churned }));
    await metric(-4, 800, 16, 2, 0);
    await metric(-3, 900, 18, 3, 1);
    await metric(-2, 999, 20, 3, 1);
    await metric(-2, 1000, 20, 3, 1);
    await metric(-1, 1100, 22, 3, 1);
    await rejectsWith(metric(1, 1200, 24, 2, 0), { detail: "occurred_in_future" });

    const portfolio = await h.as(o.userId, (tx) => getPortfolio(tx));
    const item = portfolio.items[0];
    expect(item.latestMetrics).toMatchObject({ month: month(-1), mrr: 1100, activeCustomers: 22 });
    expect(item.latestMetrics!.churnRate).toBeCloseTo(1 / 20);
    expect(item.lifetime.profit).toBe(1630.5);
    expect(item.assessment.recommendation).toBe("invest");
    expect(item.assessment.reasons.join(" ")).toMatch(/MRR growth \d+\.\d%\/month/);
    expect(portfolio.totals).toEqual([expect.objectContaining({ currency: "USD", mrr: 1100, products: 1 })]);

    // A second product in another currency is totalled separately, never summed.
    await h.as(o.userId, (tx) => createProduct(tx, product({ name: "EuroTool", currency: "EUR" })));
    expect((await h.as(o.userId, (tx) => getPortfolio(tx))).totals.map((t) => t.currency).sort()).toEqual(["EUR", "USD"]);
  });

  it("tracks milestones, releases, backlog, feedback and bugs with status dates", async () => {
    const o = await h.newOwner();
    const p = await h.as(o.userId, (tx) => createProduct(tx, product({ stage: "beta" })));
    const q = await h.as(o.userId, (tx) => createProduct(tx, product({ name: "Other" })));
    const item = (c: Parameters<typeof createItem>[2], body: Record<string, unknown>, productId = p.id) =>
      h.as(o.userId, (tx) => createItem(tx, productId, c, body)) as Promise<Record<string, unknown> & { id: string }>;

    const ms = await item("milestones", { title: "10 beta users", dueOn: addDays(today, 30) });
    const done = await h.as(o.userId, (tx) => updateItem(tx, p.id, "milestones", ms.id, { status: "done" }));
    expect(done).toMatchObject({ status: "done", completedOn: today, dueOn: addDays(today, 30) });

    const rel = await item("releases", { version: "0.9.0", releasedOn: addDays(today, -2) });
    await rejectsWith(item("releases", { version: "1.0.0", releasedOn: addDays(today, 3) }), { detail: "occurred_in_future" });
    const planned = await item("releases", { version: "1.0.0", plannedOn: addDays(today, 14) });
    expect(planned).toMatchObject({ releasedOn: null, plannedOn: addDays(today, 14) });

    const feat = await item("features", { title: "Slack reminders", priority: "must", impact: 5, effort: 2 });
    const shipped = await h.as(o.userId, (tx) => updateItem(tx, p.id, "features", feat.id, { status: "shipped", releaseId: rel.id }));
    expect(shipped).toMatchObject({ status: "shipped", shippedOn: addDays(today, -2) });
    // A PATCH that changes one field leaves the rest alone.
    const renamed = await h.as(o.userId, (tx) => updateItem(tx, p.id, "features", feat.id, { title: "Slack + Teams reminders" }));
    expect(renamed).toMatchObject({ status: "shipped", priority: "must", shippedOn: addDays(today, -2) });
    const otherRelease = await item("releases", { version: "0.1.0" }, q.id);
    await expect(h.as(o.userId, (tx) => updateItem(tx, p.id, "features", feat.id, { releaseId: otherRelease.id }))).rejects.toMatchObject({ code: "validation_failed" });

    await item("feedback", { kind: "feature_request", sentiment: "positive", content: "Need Teams too", featureId: feat.id, source: "interview" });
    await item("feedback", { kind: "feature_request", content: "Teams please", featureId: feat.id });
    let detail = await h.as(o.userId, (tx) => getProduct(tx, p.id));
    expect(detail.features[0].requests).toBe(2);
    expect(detail.feedbackLast90).toBe(2);

    const bug = await item("bugs", { title: "Duplicate reminders", severity: "critical" });
    expect(bug).toMatchObject({ status: "open", reportedOn: today, fixedOn: null });
    expect((await h.as(o.userId, (tx) => getProduct(tx, p.id))).openCriticalBugs).toBe(1);
    const fixed = await h.as(o.userId, (tx) => updateItem(tx, p.id, "bugs", bug.id, { status: "fixed", releaseId: rel.id }));
    expect(fixed).toMatchObject({ status: "fixed", fixedOn: today, severity: "critical" });

    // Deleting a release unlinks its features and bugs; deleting a feature unlinks feedback.
    await h.as(o.userId, (tx) => deleteItem(tx, p.id, "releases", rel.id));
    await h.as(o.userId, (tx) => deleteItem(tx, p.id, "features", feat.id));
    detail = await h.as(o.userId, (tx) => getProduct(tx, p.id));
    expect(detail.bugs[0].releaseId).toBeNull();
    expect(detail.feedback.every((f) => f.featureId === null)).toBe(true);
    expect(detail.assessment.recommendation).toBe("validate");
  });
});
