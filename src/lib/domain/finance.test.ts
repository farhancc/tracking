import { describe, expect, it } from "vitest";
import { fiTarget, milestones, monthlyActuals, position, projectFi, summary, type Balance, type ExpenseEntry, type IncomeEntry, type ProductMonth } from "./finance";

const months = ["2026-08-01", "2026-09-01", "2026-10-01"];
const income: IncomeEntry[] = [
  { receivedOn: "2026-08-28", source: "salary", amount: 5000, recurring: true },
  { receivedOn: "2026-09-28", source: "salary", amount: 5000, recurring: true },
  { receivedOn: "2026-10-28", source: "salary", amount: 5000, recurring: true },
  { receivedOn: "2026-09-15", source: "consulting", amount: 1500, recurring: true },
  { receivedOn: "2026-10-15", source: "consulting", amount: 1500, recurring: true },
  { receivedOn: "2026-10-20", source: "course", amount: 4200, recurring: false },
];
const expenses: ExpenseEntry[] = [
  ...months.map((m) => ({ spentOn: m.replace("-01", "-05"), category: "housing" as const, amount: 1800, essential: true })),
  ...months.map((m) => ({ spentOn: m.replace("-01", "-09"), category: "entertainment" as const, amount: 400, essential: false })),
  { spentOn: "2026-10-11", category: "business", amount: 300, essential: false },
];
const products: ProductMonth[] = [
  { month: "2026-09-01", revenue: 200, expenses: 350, profitableProducts: [] },
  { month: "2026-10-01", revenue: 900, expenses: 300, profitableProducts: ["InvoiceBot"] },
];

describe("finance", () => {
  it("builds monthly actuals with product ledger figures and business profit", () => {
    const m = monthlyActuals(months, income, expenses, products);
    const oct = m[2];
    expect(oct.income).toMatchObject({ salary: 5000, consulting: 1500, course: 4200, product: 900 });
    expect(oct).toMatchObject({ totalIncome: 11600, businessIncome: 6600, expenses: 2800, essentialExpenses: 1800, businessExpenses: 600, savings: 8800, businessProfit: 6000, recurringBusinessIncome: 1500 });
    expect(oct.savingsRate).toBeCloseTo(8800 / 11600);
    expect(m[0].savingsRate).toBeCloseTo(0.56);
    const s = summary(m);
    expect(s.essentialMonthly).toBe(1800);
    expect(s.annualIncome).toBe(5000 + 6700 + 11600);
  });

  it("computes net worth, debt and the FI target with its assumptions", () => {
    const balances: Balance[] = [
      { accountId: "inv", kind: "investment", asOf: "2026-09-30", balance: 40000 },
      { accountId: "inv", kind: "investment", asOf: "2026-10-31", balance: 42000 },
      { accountId: "ef", kind: "emergency_fund", asOf: "2026-10-31", balance: 11000 },
      { accountId: "card", kind: "credit_card", asOf: "2026-09-30", balance: 2500 },
      { accountId: "card", kind: "credit_card", asOf: "2026-10-31", balance: 0 },
    ];
    expect(position(balances, "2026-10-31")).toMatchObject({ assets: 53000, debt: 0, netWorth: 53000, investable: 42000, emergencyFund: 11000 });
    expect(position(balances, "2026-10-15")).toMatchObject({ debt: 2500, netWorth: 37500 });
    expect(fiTarget(30000, 4)).toBe(750000);
    expect(fiTarget(null, 4)).toBeNull();
    const p = projectFi({ investable: 42000, target: 750000, monthlySaving: 3000, expectedReturnPct: 5, from: "2026-11-03" })!;
    expect(p.reachable).toBe(true);
    expect(p.months).toBeGreaterThan(120);
    expect(p.months).toBeLessThan(180);
    expect(projectFi({ investable: 0, target: 1e9, monthlySaving: 0, expectedReturnPct: 0, from: "2026-11-03" })).toEqual({ months: null, date: null, reachable: false });

    const ms = milestones({
      months: monthlyActuals(months, income, expenses, products),
      balances,
      products,
      firstMrrMonth: "2026-09-01",
      essentialMonthly: 1800,
      emergencyMonths: 6,
    });
    const by = Object.fromEntries(ms.map((m) => [m.key, m]));
    expect(by.debt_cleared.achievedOn).toBe("2026-10-31");
    expect(by.emergency_fund.achievedOn).toBe("2026-10-31"); // 11 000 ≥ 6 × 1 800
    expect(by.first_profitable_product).toMatchObject({ achievedOn: "2026-10-01", detail: "InvoiceBot made a profit" });
    expect(by.first_recurring.achievedOn).toBe("2026-09-01");
    expect(by.business_beats_salary.achievedOn).toBe("2026-10-01");
    expect(by.twelve_months_independent.achievedOn).toBeNull();
  });

  it("only counts debt cleared when debt existed and is gone", () => {
    const none = milestones({ months: [], balances: [], products: [], firstMrrMonth: null, essentialMonthly: null, emergencyMonths: 6 });
    expect(none.find((m) => m.key === "debt_cleared")).toMatchObject({ achievedOn: null, detail: "No debt recorded" });
    const back = milestones({
      months: [],
      balances: [
        { accountId: "l", kind: "loan", asOf: "2026-01-01", balance: 900 },
        { accountId: "l", kind: "loan", asOf: "2026-03-01", balance: 0 },
        { accountId: "l", kind: "loan", asOf: "2026-06-01", balance: 400 },
      ],
      products: [],
      firstMrrMonth: null,
      essentialMonthly: null,
      emergencyMonths: 6,
    });
    expect(back.find((m) => m.key === "debt_cleared")?.achievedOn).toBeNull();
  });
});
