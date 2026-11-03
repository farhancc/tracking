/**
 * Personal finance: settings and assumptions, income and expense entries,
 * accounts with dated balances, and forecasts (kept apart from actuals).
 */
import { sql } from "drizzle-orm";
import { boolean, char, check, date, foreignKey, index, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { ACCOUNT_KINDS, EXPENSE_CATEGORIES, INCOME_SOURCES } from "../../lib/domain/finance";
import { inList, ownerColumn, pk, timestamps } from "./_columns";
import { users } from "./auth";

const money = (name: string) => numeric(name, { precision: 20, scale: 2, mode: "number" });

export const financeSettings = pgTable(
  "finance_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .default(sql`app.current_user_id()`)
      .references(() => users.id, { onDelete: "cascade" }),
    currency: char("currency", { length: 3 }).notNull(),
    /** Assumption: safe withdrawal rate used for the FI target. */
    withdrawalRatePct: numeric("withdrawal_rate_pct", { precision: 4, scale: 2, mode: "number" }).notNull().default(4),
    /** Assumption: your own estimate of annual expenses in independence (else recent spending × 12). */
    annualExpensesEstimate: money("annual_expenses_estimate"),
    /** Assumption: average yearly return used only for projections. */
    expectedReturnPct: numeric("expected_return_pct", { precision: 4, scale: 2, mode: "number" }).notNull().default(5),
    emergencyMonths: numeric("emergency_months", { precision: 4, scale: 1, mode: "number" }).notNull().default(6),
    ...timestamps(),
  },
  (t) => [
    check("finance_settings_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("finance_settings_withdrawal_check", sql`${t.withdrawalRatePct} > 0 and ${t.withdrawalRatePct} <= 20`),
    check("finance_settings_return_check", sql`${t.expectedReturnPct} between -20 and 30`),
    check("finance_settings_emergency_check", sql`${t.emergencyMonths} between 0 and 60`),
    check("finance_settings_expenses_check", sql`${t.annualExpensesEstimate} is null or ${t.annualExpensesEstimate} > 0`),
  ],
);

export const financeIncome = pgTable(
  "finance_income",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    receivedOn: date("received_on", { mode: "string" }).notNull(),
    source: text("source", { enum: INCOME_SOURCES }).notNull(),
    amount: money("amount").notNull(),
    recurring: boolean("recurring").notNull().default(false),
    description: text("description"),
    ...timestamps(),
  },
  (t) => [
    check("finance_income_source_check", sql`${t.source} in (${inList(INCOME_SOURCES)})`),
    check("finance_income_amount_check", sql`${t.amount} > 0`),
    index("finance_income_user_date_idx").on(t.userId, t.receivedOn),
  ],
);

export const financeExpenses = pgTable(
  "finance_expenses",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    spentOn: date("spent_on", { mode: "string" }).notNull(),
    category: text("category", { enum: EXPENSE_CATEGORIES }).notNull(),
    amount: money("amount").notNull(),
    essential: boolean("essential").notNull(),
    description: text("description"),
    ...timestamps(),
  },
  (t) => [
    check("finance_expenses_category_check", sql`${t.category} in (${inList(EXPENSE_CATEGORIES)})`),
    check("finance_expenses_amount_check", sql`${t.amount} > 0`),
    index("finance_expenses_user_date_idx").on(t.userId, t.spentOn),
  ],
);

export const financeAccounts = pgTable(
  "finance_accounts",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ACCOUNT_KINDS }).notNull(),
    interestRatePct: numeric("interest_rate_pct", { precision: 5, scale: 2, mode: "number" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("finance_accounts_id_user_key").on(t.id, t.userId),
    unique("finance_accounts_user_name_key").on(t.userId, t.name),
    check("finance_accounts_kind_check", sql`${t.kind} in (${inList(ACCOUNT_KINDS)})`),
    check("finance_accounts_name_check", sql`length(btrim(${t.name})) between 1 and 120`),
  ],
);

export const financeBalances = pgTable(
  "finance_balances",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    asOf: date("as_of", { mode: "string" }).notNull(),
    /** Positive numbers; debts are stored as the amount owed. */
    balance: money("balance").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "finance_balances_account_fk", columns: [t.accountId, t.userId], foreignColumns: [financeAccounts.id, financeAccounts.userId] }).onDelete("cascade"),
    unique("finance_balances_account_date_key").on(t.accountId, t.asOf),
    check("finance_balances_balance_check", sql`${t.balance} >= 0`),
  ],
);

/** Plans: expected income or spending for a month. Never mixed into actuals. */
export const financeForecasts = pgTable(
  "finance_forecasts",
  {
    id: pk(),
    userId: ownerColumn().references(() => users.id, { onDelete: "cascade" }),
    month: date("month", { mode: "string" }).notNull(),
    kind: text("kind", { enum: ["income", "expense"] }).notNull(),
    label: text("label").notNull(),
    amount: money("amount").notNull(),
    source: text("source", { enum: INCOME_SOURCES }),
    ...timestamps(),
  },
  (t) => [
    check("finance_forecasts_kind_check", sql`${t.kind} in ('income', 'expense')`),
    check("finance_forecasts_month_check", sql`extract(day from ${t.month}) = 1`),
    check("finance_forecasts_amount_check", sql`${t.amount} > 0`),
    check("finance_forecasts_label_check", sql`length(btrim(${t.label})) between 1 and 200`),
    check("finance_forecasts_source_check", sql`${t.source} is null or (${t.kind} = 'income' and ${t.source} in (${inList(INCOME_SOURCES)}))`),
    index("finance_forecasts_user_month_idx").on(t.userId, t.month),
  ],
);
