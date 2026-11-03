/**
 * Personal finance and financial independence. Actual figures come only from
 * recorded entries and balances; forecasts and projections are kept apart and
 * always carry their assumptions.
 */
import { addMonths, type IsoDate } from "./dates";

export const INCOME_SOURCES = ["salary", "business", "product", "course", "consulting", "other"] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];
export const INCOME_SOURCE_LABELS: Record<IncomeSource, string> = {
  salary: "Salary",
  business: "Business revenue",
  product: "Product revenue",
  course: "Course revenue",
  consulting: "Consulting income",
  other: "Other income",
};
/** Income that comes from your own business (not employment). */
export const BUSINESS_SOURCES: readonly IncomeSource[] = ["business", "product", "course", "consulting"];

export const EXPENSE_CATEGORIES = ["housing", "food", "transport", "utilities", "insurance", "health", "debt_repayment", "education", "family", "entertainment", "travel", "business", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  housing: "Housing",
  food: "Food",
  transport: "Transport",
  utilities: "Utilities",
  insurance: "Insurance",
  health: "Health",
  debt_repayment: "Debt repayment",
  education: "Education",
  family: "Family",
  entertainment: "Entertainment",
  travel: "Travel",
  business: "Business expense",
  other: "Other",
};
/** Default for the "essential" flag when an expense is recorded (editable per entry). */
export const ESSENTIAL_BY_DEFAULT: readonly ExpenseCategory[] = ["housing", "food", "transport", "utilities", "insurance", "health", "debt_repayment", "family"];

export const ACCOUNT_KINDS = ["cash", "savings", "emergency_fund", "investment", "retirement", "property", "other_asset", "loan", "credit_card", "mortgage", "other_debt"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: "Cash / current account",
  savings: "Savings",
  emergency_fund: "Emergency fund",
  investment: "Investments",
  retirement: "Retirement",
  property: "Property",
  other_asset: "Other asset",
  loan: "Loan",
  credit_card: "Credit card",
  mortgage: "Mortgage",
  other_debt: "Other debt",
};
export const DEBT_KINDS: readonly AccountKind[] = ["loan", "credit_card", "mortgage", "other_debt"];
/** Counted towards financial independence: assets that can fund withdrawals. */
export const INVESTABLE_KINDS: readonly AccountKind[] = ["investment", "retirement", "savings"];
export const isDebt = (k: AccountKind) => DEBT_KINDS.includes(k);

export const DEFAULT_ASSUMPTIONS = { withdrawalRatePct: 4, expectedReturnPct: 5, emergencyMonths: 6 } as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
export const monthOf = (d: IsoDate) => `${d.slice(0, 7)}-01`;

export type IncomeEntry = { receivedOn: IsoDate; source: IncomeSource; amount: number; recurring: boolean };
export type ExpenseEntry = { spentOn: IsoDate; category: ExpenseCategory; amount: number; essential: boolean };
/** Product ledger figures for the same currency, by month (from the product module). */
export type ProductMonth = { month: IsoDate; revenue: number; expenses: number; profitableProducts: string[] };

export type FinanceMonth = {
  month: IsoDate;
  income: Record<IncomeSource, number>;
  totalIncome: number;
  businessIncome: number;
  expenses: number;
  essentialExpenses: number;
  businessExpenses: number;
  savings: number;
  savingsRate: number | null;
  businessProfit: number;
  recurringBusinessIncome: number;
};

const emptyIncome = () => Object.fromEntries(INCOME_SOURCES.map((s) => [s, 0])) as Record<IncomeSource, number>;

/** Month-by-month actuals. Product revenue and product costs come from the product ledger. */
export function monthlyActuals(months: IsoDate[], income: IncomeEntry[], expenses: ExpenseEntry[], products: ProductMonth[]): FinanceMonth[] {
  return months.map((month) => {
    const inc = emptyIncome();
    let recurring = 0;
    for (const e of income) {
      if (monthOf(e.receivedOn) !== month) continue;
      inc[e.source] += e.amount;
      if (e.recurring && BUSINESS_SOURCES.includes(e.source)) recurring += e.amount;
    }
    const p = products.find((x) => x.month === month);
    if (p) inc.product += p.revenue;
    let total = 0;
    let essential = 0;
    let business = p?.expenses ?? 0;
    for (const e of expenses) {
      if (monthOf(e.spentOn) !== month) continue;
      total += e.amount;
      if (e.essential) essential += e.amount;
      if (e.category === "business") business += e.amount;
    }
    // Product costs are business expenses too, so they count towards spending.
    const allExpenses = total + (p?.expenses ?? 0);
    const totalIncome = INCOME_SOURCES.reduce((a, s) => a + inc[s], 0);
    const businessIncome = BUSINESS_SOURCES.reduce((a, s) => a + inc[s], 0);
    return {
      month,
      income: Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, r2(v)])) as Record<IncomeSource, number>,
      totalIncome: r2(totalIncome),
      businessIncome: r2(businessIncome),
      expenses: r2(allExpenses),
      essentialExpenses: r2(essential),
      businessExpenses: r2(business),
      savings: r2(totalIncome - allExpenses),
      savingsRate: totalIncome > 0 ? (totalIncome - allExpenses) / totalIncome : null,
      businessProfit: r2(businessIncome - business),
      recurringBusinessIncome: r2(recurring),
    };
  });
}

export type Balance = { accountId: string; kind: AccountKind; asOf: IsoDate; balance: number };

/** Latest balance per account on or before a date. */
export function balancesAt(balances: Balance[], date: IsoDate) {
  const latest = new Map<string, Balance>();
  for (const b of balances) {
    if (b.asOf > date) continue;
    const cur = latest.get(b.accountId);
    if (!cur || b.asOf > cur.asOf) latest.set(b.accountId, b);
  }
  return [...latest.values()];
}

export function position(balances: Balance[], date: IsoDate) {
  const now = balancesAt(balances, date);
  const sum = (pred: (k: AccountKind) => boolean) => r2(now.filter((b) => pred(b.kind)).reduce((a, b) => a + b.balance, 0));
  const assets = sum((k) => !isDebt(k));
  const debt = sum(isDebt);
  return {
    assets,
    debt,
    netWorth: r2(assets - debt),
    savings: sum((k) => k === "cash" || k === "savings"),
    emergencyFund: sum((k) => k === "emergency_fund"),
    investments: sum((k) => k === "investment" || k === "retirement"),
    investable: sum((k) => INVESTABLE_KINDS.includes(k)),
    asOf: now.reduce<IsoDate | null>((m, b) => (!m || b.asOf > m ? b.asOf : m), null),
  };
}

/** FI target = annual expenses ÷ withdrawal rate (both assumptions you set). */
export function fiTarget(annualExpenses: number | null, withdrawalRatePct: number) {
  if (!annualExpenses || annualExpenses <= 0 || withdrawalRatePct <= 0) return null;
  return r2(annualExpenses / (withdrawalRatePct / 100));
}

/**
 * Projection, not a fact: months until investable assets reach the target if
 * you keep saving `monthlySaving` and returns average `expectedReturnPct` a year.
 */
export function projectFi(input: { investable: number; target: number | null; monthlySaving: number; expectedReturnPct: number; from: IsoDate }) {
  if (!input.target) return null;
  if (input.investable >= input.target) return { months: 0, date: input.from, reachable: true };
  const monthly = Math.pow(1 + input.expectedReturnPct / 100, 1 / 12) - 1;
  let value = input.investable;
  for (let m = 1; m <= 1200; m++) {
    value = value * (1 + monthly) + input.monthlySaving;
    if (value >= input.target) return { months: m, date: addMonths(monthOf(input.from), m), reachable: true };
  }
  return { months: null, date: null, reachable: false };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Headline figures from actuals. `months` are complete months, oldest first. */
export function summary(months: FinanceMonth[]) {
  const last = months.at(-1) ?? null;
  const last3 = months.slice(-3);
  const last12 = months.slice(-12);
  const sum = (xs: FinanceMonth[], k: keyof FinanceMonth) => r2(xs.reduce((a, m) => a + (m[k] as number), 0));
  return {
    lastMonth: last,
    savingsRateLastMonth: last?.savingsRate ?? null,
    savingsRate3m: sum(last3, "totalIncome") > 0 ? (sum(last3, "totalIncome") - sum(last3, "expenses")) / sum(last3, "totalIncome") : null,
    avgMonthlySaving3m: last3.length ? r2(sum(last3, "savings") / last3.length) : 0,
    annualIncome: sum(last12, "totalIncome"),
    annualBusinessProfit: sum(last12, "businessProfit"),
    essentialMonthly: avg(last3.map((m) => m.essentialExpenses)),
    monthlyExpenses3m: avg(last3.map((m) => m.expenses)),
    monthsOfData: months.filter((m) => m.totalIncome || m.expenses).length,
  };
}

export type Milestone = { key: string; label: string; achievedOn: IsoDate | null; detail: string };

/** The six milestones, computed from recorded data only, each with the month it first happened. */
export function milestones(input: {
  months: FinanceMonth[];
  balances: Balance[];
  products: ProductMonth[];
  /** Earliest month any product recorded MRR > 0. */
  firstMrrMonth: IsoDate | null;
  essentialMonthly: number | null;
  emergencyMonths: number;
  /** Money formatting for the details (defaults to plain numbers). */
  format?: (n: number) => string;
}): Milestone[] {
  const out: Milestone[] = [];
  const f = input.format ?? ((n: number) => n.toFixed(2));
  const dates = [...new Set(input.balances.map((b) => b.asOf))].sort();

  // 1. Debt cleared: debt was recorded, and on some date every debt account is at zero.
  const hadDebt = input.balances.some((b) => isDebt(b.kind) && b.balance > 0);
  const debtClearedOn = hadDebt
    ? (dates.find((d) => {
        const at = balancesAt(input.balances, d).filter((b) => isDebt(b.kind));
        const before = input.balances.some((b) => isDebt(b.kind) && b.balance > 0 && b.asOf <= d);
        return before && at.length > 0 && at.every((b) => b.balance <= 0);
      }) ?? null)
    : null;
  const debtNow = position(input.balances, dates.at(-1) ?? "9999-12-31").debt;
  out.push({
    key: "debt_cleared",
    label: "Debt cleared",
    achievedOn: debtClearedOn && debtNow <= 0 ? debtClearedOn : null,
    detail: hadDebt ? (debtNow > 0 ? `${f(debtNow)} outstanding` : "All recorded debt at zero") : "No debt recorded",
  });

  // 2. Emergency fund completed: emergency-fund balance ≥ N months of essential expenses.
  const need = input.essentialMonthly ? input.essentialMonthly * input.emergencyMonths : null;
  const efOn = need ? (dates.find((d) => position(input.balances, d).emergencyFund >= need) ?? null) : null;
  const efNow = position(input.balances, dates.at(-1) ?? "9999-12-31").emergencyFund;
  out.push({
    key: "emergency_fund",
    label: "Emergency fund completed",
    achievedOn: efOn,
    detail: need ? `${f(efNow)} of ${f(need)} (${input.emergencyMonths} months of essentials)` : "Record essential expenses to size the fund",
  });

  // 3. First profitable product (product ledger).
  const firstProfit = [...input.products].sort((a, b) => a.month.localeCompare(b.month)).find((p) => p.profitableProducts.length);
  out.push({
    key: "first_profitable_product",
    label: "First profitable product",
    achievedOn: firstProfit?.month ?? null,
    detail: firstProfit ? `${firstProfit.profitableProducts[0]} made a profit` : "No product month with revenue above its costs yet",
  });

  // 4. First recurring business income: recorded MRR or recurring business income.
  const firstRecurringIncome = input.months.find((m) => m.recurringBusinessIncome > 0)?.month ?? null;
  const firstRecurring = [input.firstMrrMonth, firstRecurringIncome].filter((x): x is IsoDate => !!x).sort()[0] ?? null;
  out.push({ key: "first_recurring", label: "First recurring business income", achievedOn: firstRecurring, detail: firstRecurring ? "Recurring revenue recorded" : "No MRR or recurring income yet" });

  // 5. First month business income exceeded salary.
  const beat = input.months.find((m) => m.businessIncome > 0 && m.businessIncome > m.income.salary);
  out.push({
    key: "business_beats_salary",
    label: "First month exceeding salary through business",
    achievedOn: beat?.month ?? null,
    detail: beat ? `Business ${f(beat.businessIncome)} vs salary ${f(beat.income.salary)}` : "Not yet",
  });

  // 6. Twelve consecutive months where business profit covered all spending.
  let run = 0;
  let twelveOn: IsoDate | null = null;
  let best = 0;
  for (const m of input.months) {
    if (m.expenses > 0 && m.businessProfit >= m.expenses - m.businessExpenses) run += 1;
    else run = 0;
    best = Math.max(best, run);
    if (run === 12 && !twelveOn) twelveOn = m.month;
  }
  out.push({
    key: "twelve_months_independent",
    label: "Twelve months of independent business income",
    achievedOn: twelveOn,
    detail: twelveOn ? "Business profit covered personal spending for 12 months in a row" : `${run} month(s) in a row so far (best ${best})`,
  });
  return out;
}
