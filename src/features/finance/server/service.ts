/**
 * Finance service. Actuals: income and expense entries, dated balances and the
 * product ledger (same currency only). Forecasts and projections are separate.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import { financeAccounts, financeBalances, financeExpenses, financeForecasts, financeIncome, financeSettings, productMetrics, products, productTransactions } from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import { addDays, addMonths, type IsoDate } from "@/lib/domain/dates";
import {
  ACCOUNT_KINDS,
  DEFAULT_ASSUMPTIONS,
  fiTarget,
  milestones,
  monthlyActuals,
  monthOf,
  position,
  projectFi,
  summary,
  type AccountKind,
  type ProductMonth,
} from "@/lib/domain/finance";
import { notFound } from "@/lib/errors";

export async function getSettings(tx: Tx) {
  const ws = await requireWorkspace(tx);
  await tx
    .insert(financeSettings)
    .values({ currency: ws.profile?.baseCurrency ?? "USD", ...DEFAULT_ASSUMPTIONS })
    .onConflictDoNothing();
  const [s] = await tx.select().from(financeSettings).limit(1);
  return s;
}

export async function updateSettings(tx: Tx, patch: Partial<typeof financeSettings.$inferInsert>) {
  await getSettings(tx);
  const [s] = await tx.update(financeSettings).set(patch).where(eq(financeSettings.userId, sql`app.current_user_id()`)).returning();
  return s;
}

async function today(tx: Tx) {
  return (await requireWorkspace(tx)).today;
}

export async function addIncome(tx: Tx, input: Omit<typeof financeIncome.$inferInsert, "receivedOn"> & { receivedOn: string | null }) {
  const [row] = await tx.insert(financeIncome).values({ ...input, receivedOn: input.receivedOn ?? (await today(tx)) }).returning();
  return row;
}
export async function deleteIncome(tx: Tx, id: string) {
  const [row] = await tx.delete(financeIncome).where(eq(financeIncome.id, id)).returning();
  if (!row) throw notFound("Income entry");
}
export async function addExpense(tx: Tx, input: Omit<typeof financeExpenses.$inferInsert, "spentOn"> & { spentOn: string | null }) {
  const [row] = await tx.insert(financeExpenses).values({ ...input, spentOn: input.spentOn ?? (await today(tx)) }).returning();
  return row;
}
export async function deleteExpense(tx: Tx, id: string) {
  const [row] = await tx.delete(financeExpenses).where(eq(financeExpenses.id, id)).returning();
  if (!row) throw notFound("Expense");
}

export async function createAccount(tx: Tx, input: { name: string; kind: AccountKind; interestRatePct: number | null; notes: string | null; balance: number | null }) {
  const { balance, ...values } = input;
  const [row] = await tx.insert(financeAccounts).values(values).returning();
  if (balance != null) await recordBalance(tx, row.id, { asOf: null, balance });
  return row;
}
export async function archiveAccount(tx: Tx, id: string) {
  const [row] = await tx.update(financeAccounts).set({ archivedAt: new Date() }).where(eq(financeAccounts.id, id)).returning();
  if (!row) throw notFound("Account");
}
/** One balance per account and date: recording the same day again corrects it. */
export async function recordBalance(tx: Tx, accountId: string, input: { asOf: string | null; balance: number }) {
  const [acc] = await tx.select({ id: financeAccounts.id }).from(financeAccounts).where(eq(financeAccounts.id, accountId)).limit(1);
  if (!acc) throw notFound("Account");
  const asOf = input.asOf ?? (await today(tx));
  const [row] = await tx
    .insert(financeBalances)
    .values({ accountId, asOf, balance: input.balance })
    .onConflictDoUpdate({ target: [financeBalances.accountId, financeBalances.asOf], set: { balance: input.balance } })
    .returning();
  return row;
}
export async function deleteBalance(tx: Tx, id: string) {
  const [row] = await tx.delete(financeBalances).where(eq(financeBalances.id, id)).returning();
  if (!row) throw notFound("Balance");
}

export async function addForecast(tx: Tx, input: typeof financeForecasts.$inferInsert) {
  const [row] = await tx.insert(financeForecasts).values(input).returning();
  return row;
}
export async function deleteForecast(tx: Tx, id: string) {
  const [row] = await tx.delete(financeForecasts).where(eq(financeForecasts.id, id)).returning();
  if (!row) throw notFound("Forecast");
}

const monthsBetween = (from: IsoDate, to: IsoDate) => {
  const out: IsoDate[] = [];
  for (let m = monthOf(from); m <= monthOf(to) && out.length < 600; m = addMonths(m, 1)) out.push(m);
  return out;
};

/** Product revenue, costs and profitable products per month, from the product ledger, in this currency only. */
async function productMonths(tx: Tx, currency: string): Promise<{ months: ProductMonth[]; excluded: string[]; firstMrrMonth: IsoDate | null; latestMrr: number }> {
  const list = await tx.select({ id: products.id, name: products.name, currency: products.currency, status: products.status }).from(products).where(isNull(products.archivedAt));
  const same = list.filter((p) => p.currency === currency);
  const excluded = list.filter((p) => p.currency !== currency).map((p) => `${p.name} (${p.currency})`);
  if (!same.length) return { months: [], excluded, firstMrrMonth: null, latestMrr: 0 };
  const ids = same.map((p) => p.id);
  const rows = await tx
    .select({
      productId: productTransactions.productId,
      month: sql<string>`to_char(date_trunc('month', ${productTransactions.occurredOn}), 'YYYY-MM-DD')`,
      revenue: sql<string>`coalesce(sum(case when ${productTransactions.kind} = 'revenue' and ${productTransactions.category} <> 'refund' then ${productTransactions.amount} end), 0)`,
      refunds: sql<string>`coalesce(sum(case when ${productTransactions.category} = 'refund' then ${productTransactions.amount} end), 0)`,
      expenses: sql<string>`coalesce(sum(case when ${productTransactions.kind} = 'expense' then ${productTransactions.amount} end), 0)`,
    })
    .from(productTransactions)
    .where(inArray(productTransactions.productId, ids))
    .groupBy(productTransactions.productId, sql`date_trunc('month', ${productTransactions.occurredOn})`);
  const byMonth = new Map<IsoDate, ProductMonth>();
  for (const r of rows) {
    const m = byMonth.get(r.month) ?? { month: r.month, revenue: 0, expenses: 0, profitableProducts: [] };
    const net = Number(r.revenue) - Number(r.refunds);
    m.revenue += net;
    m.expenses += Number(r.expenses);
    if (net - Number(r.expenses) > 0) m.profitableProducts.push(same.find((p) => p.id === r.productId)!.name);
    byMonth.set(r.month, m);
  }
  const metrics = await tx.select().from(productMetrics).where(and(inArray(productMetrics.productId, ids), sql`${productMetrics.mrr} > 0`)).orderBy(asc(productMetrics.month));
  const latestPer = new Map<string, number>();
  for (const m of metrics) latestPer.set(m.productId, m.mrr ?? 0);
  const activeIds = new Set(same.filter((p) => p.status !== "discontinued").map((p) => p.id));
  return {
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    excluded,
    firstMrrMonth: metrics[0]?.month ?? null,
    latestMrr: [...latestPer.entries()].filter(([id]) => activeIds.has(id)).reduce((a, [, v]) => a + v, 0),
  };
}

export async function getDashboard(tx: Tx) {
  const ws = await requireWorkspace(tx);
  const settings = await getSettings(tx);
  const now = ws.today;
  const thisMonth = monthOf(now);
  const income = await tx.select().from(financeIncome).orderBy(desc(financeIncome.receivedOn), desc(financeIncome.createdAt));
  const expenses = await tx.select().from(financeExpenses).orderBy(desc(financeExpenses.spentOn), desc(financeExpenses.createdAt));
  const accounts = await tx.select().from(financeAccounts).where(isNull(financeAccounts.archivedAt)).orderBy(asc(financeAccounts.name));
  const balanceRows = await tx.select().from(financeBalances).orderBy(asc(financeBalances.asOf));
  const kindOf = new Map(accounts.map((a) => [a.id, a.kind]));
  const balances = balanceRows.filter((b) => kindOf.has(b.accountId)).map((b) => ({ accountId: b.accountId, kind: kindOf.get(b.accountId)!, asOf: b.asOf, balance: b.balance }));
  const prod = await productMonths(tx, settings.currency);

  const earliest = [income.at(-1)?.receivedOn, expenses.at(-1)?.spentOn, prod.months[0]?.month].filter((x): x is string => !!x).sort()[0] ?? thisMonth;
  const allMonths = monthsBetween(earliest, now);
  const actuals = monthlyActuals(allMonths, income, expenses, prod.months);
  const complete = actuals.filter((m) => m.month < thisMonth);
  const current = actuals.find((m) => m.month === thisMonth) ?? null;
  const s = summary(complete);
  const pos = position(balances, now);
  const lastComplete = complete.at(-1);
  const annualExpenses = settings.annualExpensesEstimate ?? (s.monthlyExpenses3m != null ? Math.round(s.monthlyExpenses3m * 12 * 100) / 100 : null);
  const target = fiTarget(annualExpenses, settings.withdrawalRatePct);

  // Forecasts: this month and the next five, next to actuals where they exist.
  const forecastRows = await tx
    .select()
    .from(financeForecasts)
    .where(and(gte(financeForecasts.month, addMonths(thisMonth, -2)), lte(financeForecasts.month, addMonths(thisMonth, 5))))
    .orderBy(asc(financeForecasts.month), asc(financeForecasts.kind));
  const plan = monthsBetween(addMonths(thisMonth, -2), addMonths(thisMonth, 5)).map((m) => {
    const f = forecastRows.filter((r) => r.month === m);
    const a = actuals.find((x) => x.month === m) ?? null;
    return {
      month: m,
      forecastIncome: f.filter((r) => r.kind === "income").reduce((x, r) => x + r.amount, 0),
      forecastExpenses: f.filter((r) => r.kind === "expense").reduce((x, r) => x + r.amount, 0),
      actualIncome: m <= thisMonth ? (a?.totalIncome ?? 0) : null,
      actualExpenses: m <= thisMonth ? (a?.expenses ?? 0) : null,
      partial: m === thisMonth,
      items: f,
    };
  });

  return {
    today: now,
    settings,
    accounts: accounts.map((a) => {
      const hist = balanceRows.filter((b) => b.accountId === a.id);
      return { ...a, latest: hist.at(-1) ?? null, history: hist.slice(-6).reverse() };
    }),
    position: pos,
    months: actuals.slice(-13),
    current,
    summary: s,
    recurringBusinessIncome: {
      productMrr: Math.round(prod.latestMrr * 100) / 100,
      otherRecurring: lastComplete?.recurringBusinessIncome ?? 0,
      total: Math.round((prod.latestMrr + (lastComplete?.recurringBusinessIncome ?? 0)) * 100) / 100,
    },
    fi: {
      annualExpenses,
      annualExpensesSource: settings.annualExpensesEstimate != null ? ("your estimate" as const) : annualExpenses != null ? ("last 3 months × 12" as const) : null,
      target,
      progress: target ? Math.min(1, pos.investable / target) : null,
      projection: projectFi({ investable: pos.investable, target, monthlySaving: Math.max(0, s.avgMonthlySaving3m), expectedReturnPct: settings.expectedReturnPct, from: now }),
    },
    milestones: milestones({
      months: complete.concat(current ? [current] : []),
      balances,
      products: prod.months,
      firstMrrMonth: prod.firstMrrMonth,
      essentialMonthly: s.essentialMonthly,
      emergencyMonths: settings.emergencyMonths,
      format: (n) => new Intl.NumberFormat("en", { style: "currency", currency: settings.currency, maximumFractionDigits: 0 }).format(n),
    }),
    plan,
    excludedProducts: prod.excluded,
    recentIncome: income.slice(0, 30),
    recentExpenses: expenses.filter((e) => e.spentOn >= addDays(now, -120)).slice(0, 40),
    accountKinds: ACCOUNT_KINDS,
  };
}
