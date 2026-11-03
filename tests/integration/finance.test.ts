import { afterAll, describe, expect, it } from "vitest";
import { accountSchema, expenseSchema, forecastSchema, incomeSchema } from "../../src/features/finance/schemas";
import { addExpense, addForecast, addIncome, createAccount, getDashboard, recordBalance, updateSettings } from "../../src/features/finance/server/service";
import { productCreateSchema } from "../../src/features/products/schemas";
import { createItem, createProduct } from "../../src/features/products/server/service";
import { addDays, addMonths, todayIn } from "../../src/lib/domain/dates";
import { monthOf } from "../../src/lib/domain/finance";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());
const today = todayIn("UTC");
const m = (k: number, day = 10) => `${addMonths(monthOf(today), k).slice(0, 8)}${String(day).padStart(2, "0")}`;

describe("financial independence", () => {
  it("computes actuals, FI target and milestones, separate from forecasts", async () => {
    const o = await h.newOwner();
    for (const k of [-3, -2, -1]) {
      await h.as(o.userId, (tx) => addIncome(tx, incomeSchema.parse({ receivedOn: m(k, 28), source: "salary", amount: 5000, recurring: true })));
      await h.as(o.userId, (tx) => addExpense(tx, expenseSchema.parse({ spentOn: m(k, 3), category: "housing", amount: 1500 })));
      await h.as(o.userId, (tx) => addExpense(tx, expenseSchema.parse({ spentOn: m(k, 12), category: "entertainment", amount: 500 })));
    }
    await h.as(o.userId, (tx) => addIncome(tx, incomeSchema.parse({ receivedOn: m(-1, 15), source: "consulting", amount: 6000, recurring: "on" })));
    await rejectsWith(h.as(o.userId, (tx) => addIncome(tx, incomeSchema.parse({ receivedOn: addDays(today, 1), source: "salary", amount: 1 }))), { detail: "occurred_in_future" });
    // Essential defaults by category; entertainment isn't essential.
    expect(expenseSchema.parse({ category: "housing", amount: 1 }).essential).toBe(true);
    expect(expenseSchema.parse({ category: "travel", amount: 1 }).essential).toBe(false);

    // Product revenue comes from the product ledger, in the same currency only.
    const p = await h.as(o.userId, (tx) => createProduct(tx, productCreateSchema.parse({ name: "InvoiceBot", stage: "growth", launchedOn: m(-6), currency: "USD" })));
    await h.as(o.userId, (tx) => createItem(tx, p.id, "transactions", { category: "subscription", amount: 800, occurredOn: m(-1, 20) }));
    await h.as(o.userId, (tx) => createItem(tx, p.id, "transactions", { category: "hosting", amount: 200, occurredOn: m(-1, 2) }));
    await h.as(o.userId, (tx) => createItem(tx, p.id, "metrics", { month: m(-1), mrr: 800, activeCustomers: 16 }));
    const eur = await h.as(o.userId, (tx) => createProduct(tx, productCreateSchema.parse({ name: "EuroTool", currency: "EUR" })));
    await h.as(o.userId, (tx) => createItem(tx, eur.id, "transactions", { category: "subscription", amount: 99999, occurredOn: m(-1, 20) }));

    const debt = await h.as(o.userId, (tx) => createAccount(tx, accountSchema.parse({ name: "Credit card", kind: "credit_card", balance: 3000 })));
    await h.as(o.userId, (tx) => recordBalance(tx, debt.id, { asOf: addDays(today, -40), balance: 3000 }));
    await h.as(o.userId, (tx) => recordBalance(tx, debt.id, { asOf: today, balance: 0 }));
    await h.as(o.userId, (tx) => createAccount(tx, accountSchema.parse({ name: "Index fund", kind: "investment", balance: 60000 })));
    await h.as(o.userId, (tx) => createAccount(tx, accountSchema.parse({ name: "Rainy day", kind: "emergency_fund", balance: 12000 })));
    await rejectsWith(h.as(o.userId, (tx) => recordBalance(tx, debt.id, { asOf: addDays(today, 3), balance: 1 })), { detail: "occurred_in_future" });

    // Forecasts never change the actual figures.
    await h.as(o.userId, (tx) => addForecast(tx, forecastSchema.parse({ month: addMonths(monthOf(today), 1).slice(0, 7), kind: "income", label: "Big consulting contract", amount: 50000, source: "consulting" })));

    const d = await h.as(o.userId, (tx) => getDashboard(tx));
    const last = d.months.find((x) => x.month === addMonths(monthOf(today), -1))!;
    expect(last).toMatchObject({ totalIncome: 11800, businessIncome: 6800, expenses: 2200, businessProfit: 6600, savings: 9600 });
    expect(d.summary.essentialMonthly).toBe(1500);
    expect(d.summary.annualIncome).toBe(5000 * 3 + 6000 + 800);
    expect(d.position).toMatchObject({ debt: 0, netWorth: 72000, investable: 60000, emergencyFund: 12000 });
    expect(d.recurringBusinessIncome).toMatchObject({ productMrr: 800, otherRecurring: 6000, total: 6800 });
    expect(d.excludedProducts).toEqual(["EuroTool (EUR)"]);
    // FI target from the last 3 months of spending: 2 000/month (plus product costs) × 12 ÷ 4 %.
    expect(d.fi.annualExpensesSource).toBe("last 3 months × 12");
    expect(d.fi.target).toBeCloseTo(((2000 * 3 + 200) / 3) * 12 / 0.04, 0);
    const next = d.plan.find((x) => x.month === addMonths(monthOf(today), 1))!;
    expect(next).toMatchObject({ forecastIncome: 50000, actualIncome: null });

    const ms = Object.fromEntries(d.milestones.map((x) => [x.key, x]));
    expect(ms.debt_cleared.achievedOn).toBe(today);
    expect(ms.emergency_fund.achievedOn).not.toBeNull(); // 12 000 ≥ 6 × 1 500
    expect(ms.first_profitable_product.detail).toBe("InvoiceBot made a profit");
    expect(ms.business_beats_salary.achievedOn).toBe(addMonths(monthOf(today), -1));
    expect(ms.twelve_months_independent.achievedOn).toBeNull();

    // Your own estimate and withdrawal rate replace the derived figures.
    await h.as(o.userId, (tx) => updateSettings(tx, { annualExpensesEstimate: 36000, withdrawalRatePct: 3.5 }));
    const d2 = await h.as(o.userId, (tx) => getDashboard(tx));
    expect(d2.fi).toMatchObject({ annualExpenses: 36000, annualExpensesSource: "your estimate" });
    expect(d2.fi.target).toBeCloseTo(36000 / 0.035, 0);
    expect(d2.fi.projection?.reachable).toBe(true);

    const other = await h.newOwner();
    expect((await h.as(other.userId, (tx) => getDashboard(tx))).accounts).toEqual([]);
  });
});
