import { describe, expect, it } from "vitest";
import { assessProduct, churnRate, monthlyFinance, monthRange, mrrGrowthRates, sumFinance, type AssessmentInput, type MonthlyMetric } from "./products";

const m = (month: string, mrr: number | null, active: number, added = 0, churned = 0): MonthlyMetric => ({
  month,
  mrr,
  activeCustomers: active,
  newCustomers: added,
  churnedCustomers: churned,
});

const base: AssessmentInput = {
  stage: "growth",
  status: "active",
  today: "2026-11-03",
  stageEnteredOn: "2026-01-01",
  launchedOn: "2025-06-01",
  metrics: [],
  recentFinance: { revenue: 0, refunds: 0, netRevenue: 0, expenses: 0, profit: 0 },
  feedbackLast90: 0,
  openCriticalBugs: 0,
};
const fin = (profit: number) => ({ revenue: Math.max(profit, 0), refunds: 0, netRevenue: Math.max(profit, 0), expenses: Math.max(-profit, 0), profit });

describe("finance", () => {
  it("nets refunds and expenses, keeps empty months and a running total", () => {
    const txns = [
      { occurredOn: "2026-08-15", category: "subscription" as const, amount: 100 },
      { occurredOn: "2026-09-02", category: "subscription" as const, amount: 200 },
      { occurredOn: "2026-09-05", category: "refund" as const, amount: 20 },
      { occurredOn: "2026-09-10", category: "hosting" as const, amount: 30.1 },
      { occurredOn: "2026-11-01", category: "marketing" as const, amount: 50 },
    ];
    expect(sumFinance(txns)).toEqual({ revenue: 300, refunds: 20, netRevenue: 280, expenses: 80.1, profit: 199.9 });
    const rows = monthlyFinance(txns, "2026-09-01", "2026-11-30");
    expect(rows.map((r) => [r.month, r.profit, r.cumulativeProfit])).toEqual([
      ["2026-09-01", 149.9, 249.9],
      ["2026-10-01", 0, 249.9],
      ["2026-11-01", -50, 199.9],
    ]);
    expect(rows[0].byCategory).toEqual({ subscription: 200, refund: 20, hosting: 30.1 });
    expect(monthRange("2025-12-20", "2026-02-01")).toEqual(["2025-12-01", "2026-01-01", "2026-02-01"]);
  });
});

describe("customer metrics", () => {
  it("computes churn from customers at the start of the month", () => {
    expect(churnRate(m("2026-10-01", 1000, 95, 5, 10))).toBeCloseTo(0.1);
    expect(churnRate(m("2026-10-01", 0, 3, 3, 0))).toBeNull();
  });
  it("only compares consecutive months with MRR", () => {
    expect(mrrGrowthRates([m("2026-07-01", 100, 1), m("2026-08-01", 110, 1), m("2026-10-01", 200, 1), m("2026-11-01", null, 1)])).toEqual([0.1]);
  });
});

describe("assessProduct", () => {
  it("needs data before judging a launched product", () => {
    const a = assessProduct({ ...base, metrics: [m("2026-10-01", 500, 10)] });
    expect(a.recommendation).toBe("insufficient_data");
  });
  it("recommends investing in a growing product with low churn", () => {
    const a = assessProduct({
      ...base,
      metrics: [m("2026-07-01", 1000, 50), m("2026-08-01", 1100, 55, 6, 1), m("2026-09-01", 1200, 60, 6, 1), m("2026-10-01", 1320, 66, 7, 1)],
      recentFinance: fin(900),
    });
    expect(a.recommendation).toBe("invest");
    expect(a.confidence).toBe("medium");
    expect(a.reasons[0]).toContain("MRR growth");
  });
  it("puts retention before growth when churn is high", () => {
    const a = assessProduct({
      ...base,
      metrics: [m("2026-08-01", 1000, 50), m("2026-09-01", 1100, 50, 10, 10), m("2026-10-01", 1200, 50, 10, 10)],
      recentFinance: fin(300),
    });
    expect(a.recommendation).toBe("fix_retention");
  });
  it("suggests discontinuing a shrinking, loss-making product long after launch", () => {
    const metrics = [m("2026-07-01", 900, 30), m("2026-08-01", 800, 28, 0, 2), m("2026-09-01", 700, 27, 1, 2), m("2026-10-01", 650, 26, 1, 2)];
    expect(assessProduct({ ...base, metrics, recentFinance: fin(-400) }).recommendation).toBe("discontinue");
    // Shrinking but profitable is not a discontinue.
    expect(assessProduct({ ...base, metrics, recentFinance: fin(100) }).recommendation).toBe("maintain");
    // Recently launched: pause rather than discontinue.
    expect(assessProduct({ ...base, launchedOn: "2026-07-01", metrics, recentFinance: fin(-400) }).recommendation).toBe("pause");
  });
  it("judges pre-launch products on evidence and flags stale ones", () => {
    const idle = assessProduct({ ...base, stage: "mvp", launchedOn: null, stageEnteredOn: "2026-02-01" });
    expect(idle.recommendation).toBe("pause");
    const active = assessProduct({ ...base, stage: "mvp", launchedOn: null, stageEnteredOn: "2026-02-01", feedbackLast90: 4 });
    expect(active.recommendation).toBe("validate");
    expect(assessProduct({ ...base, status: "paused" }).recommendation).toBe("paused");
    const committed = assessProduct({ ...base, stage: "validation", launchedOn: null, validation: { validatedMilestones: 4, interviews: 12, willingToPay: 3, level: 3 } });
    expect(committed.recommendation).toBe("invest");
    expect(committed.reasons[0]).toMatch(/3 customer\(s\) committed/);
    const noPay = assessProduct({ ...base, stage: "mvp", launchedOn: null, feedbackLast90: 2, validation: { validatedMilestones: 2, interviews: 10, willingToPay: 0, level: 2 } });
    expect(noPay.recommendation).toBe("validate");
    expect(noPay.reasons.join(" ")).toMatch(/No one has said they would pay yet/);
  });
});
