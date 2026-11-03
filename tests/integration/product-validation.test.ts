import { afterAll, describe, expect, it } from "vitest";
import { productCreateSchema } from "../../src/features/products/schemas";
import { createItem, createProduct, deleteItem, getPortfolio, updateProduct } from "../../src/features/products/server/service";
import { getValidation, interviewFollowUpsDue, updateStep } from "../../src/features/products/server/validation";
import { addDays, todayIn } from "../../src/lib/domain/dates";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());
const today = todayIn("UTC");

describe("product validation", () => {
  it("creates the 12 steps and only decides a step with evidence", async () => {
    const o = await h.newOwner();
    const p = await h.as(o.userId, (tx) => createProduct(tx, productCreateSchema.parse({ name: "TutorMatch", stage: "validation" })));
    const v = await h.as(o.userId, (tx) => getValidation(tx, p.id));
    expect(v.steps.map((s) => s.step)).toEqual([
      "problem_discovery",
      "customer_interviews",
      "competitor_research",
      "market_validation",
      "landing_page",
      "presales",
      "mvp_development",
      "beta_testing",
      "customer_feedback",
      "public_launch",
      "customer_acquisition",
      "retention",
    ]);
    expect(v.steps[0].successCriteria).toMatch(/specific painful problem/);
    expect(v.demand).toMatchObject({ level: 0, nextStep: "problem_discovery" });

    await rejectsWith(h.as(o.userId, (tx) => updateStep(tx, p.id, "problem_discovery", { status: "validated" })), { detail: "evidence_required" });
    const ev = await h.as(o.userId, (tx) =>
      createItem(tx, p.id, "evidence", { step: "problem_discovery", kind: "observation", summary: "8 of 10 parents spent 2+ weeks finding a tutor" }),
    );
    const step = await h.as(o.userId, (tx) => updateStep(tx, p.id, "problem_discovery", { status: "validated" }));
    expect(step).toMatchObject({ status: "validated", decidedOn: today });
    // The only evidence behind a decided step can't be deleted; reopening allows it.
    await rejectsWith(h.as(o.userId, (tx) => deleteItem(tx, p.id, "evidence", ev.id)), { detail: "evidence_required" });
    const reopened = await h.as(o.userId, (tx) => updateStep(tx, p.id, "problem_discovery", { status: "in_progress" }));
    expect(reopened.decidedOn).toBeNull();
    await h.as(o.userId, (tx) => deleteItem(tx, p.id, "evidence", ev.id));

    await expect(h.as(o.userId, (tx) => createItem(tx, p.id, "evidence", { step: "landing_page", kind: "visitors", summary: "Week 1" }))).rejects.toBeTruthy();
    await rejectsWith(
      h.as(o.userId, (tx) => createItem(tx, p.id, "evidence", { step: "landing_page", kind: "observation", summary: "x", observedOn: addDays(today, 1) })),
      { detail: "occurred_in_future" },
    );
  });

  it("logs interviews and measures demand from commitments, gating the MVP stage", async () => {
    const o = await h.newOwner();
    const p = await h.as(o.userId, (tx) => createProduct(tx, productCreateSchema.parse({ name: "InvoiceBot", stage: "validation" })));
    const interview = (body: Record<string, unknown>) =>
      h.as(o.userId, (tx) => createItem(tx, p.id, "interviews", { customerType: "Agency owner", confirmsProblem: "yes", ...body }));
    for (let i = 0; i < 9; i++) await interview({ willingness: "verbal_yes", statedPrice: 49 });
    const followUp = await interview({ confirmsProblem: "no", willingness: "none", objections: "We use QuickBooks reminders", followUpOn: addDays(today, -1) });
    expect(followUp).toMatchObject({ interviewedOn: today, confirmsProblem: false, followUpDone: false });
    await rejectsWith(interview({ interviewedOn: addDays(today, 2) }), { detail: "occurred_in_future" });

    let v = await h.as(o.userId, (tx) => getValidation(tx, p.id));
    expect(v.demand).toMatchObject({ level: 2, interviews: 10, committed: 0, verbalYes: 9, medianStatedPrice: 49 });
    expect(v.followUpsDue).toBe(1);
    expect((await h.as(o.userId, (tx) => interviewFollowUpsDue(tx, today))).map((f) => f.productName)).toEqual(["InvoiceBot"]);

    // Verbal yeses don't open the MVP gate.
    await expect(h.as(o.userId, (tx) => updateProduct(tx, p.id, { stage: "mvp" }))).rejects.toMatchObject({ code: "validation_required" });

    await h.as(o.userId, (tx) => createItem(tx, p.id, "evidence", { step: "presales", kind: "payment", value: 490, summary: "Annual pre-order, Brightline" }));
    await h.as(o.userId, (tx) => createItem(tx, p.id, "evidence", { step: "presales", kind: "payment", value: 490, summary: "Annual pre-order, Northpeak" }));
    await interview({ willingness: "committed", statedPrice: 49, customerName: "Studio K" });
    v = await h.as(o.userId, (tx) => getValidation(tx, p.id));
    expect(v.demand).toMatchObject({ level: 3, committed: 1, presales: { count: 2, amount: 980 } });
    const mvp = await h.as(o.userId, (tx) => updateProduct(tx, p.id, { stage: "mvp" }));
    expect(mvp.stage).toBe("mvp");

    const portfolio = await h.as(o.userId, (tx) => getPortfolio(tx));
    expect(portfolio.items[0].assessment.recommendation).toBe("invest");
    expect(portfolio.items[0].demand?.levelLabel).toBe("Willingness to pay");

    // The PATCH path keeps fields it wasn't given.
    const done = await h.as(o.userId, (tx) => createItem(tx, p.id, "competitors", { name: "Chaser", pricing: "$40/mo", strengths: "Mature" }));
    const edited = (await h.as(o.userId, (tx) => import("../../src/features/products/server/service").then((m) => m.updateItem(tx, p.id, "competitors", done.id, { weaknesses: "No Slack" })))) as Record<string, unknown>;
    expect(edited).toMatchObject({ pricing: "$40/mo", strengths: "Mature", weaknesses: "No Slack" });

    // Deleting the product cascades through decided steps and their evidence.
    await h.as(o.userId, (tx) => createItem(tx, p.id, "evidence", { step: "market_validation", kind: "document", summary: "TAM sheet" }));
    await h.as(o.userId, (tx) => updateStep(tx, p.id, "market_validation", { status: "validated" }));
    await h.as(o.userId, (tx) => tx.execute(`delete from products where id = '${p.id}'`));
    expect((await h.as(o.userId, (tx) => getPortfolio(tx))).items).toEqual([]);
  });
});
