import { CheckCircle2, Circle, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Progress } from "@/components/ui/progress";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import {
  ACCOUNT_KIND_LABELS,
  ACCOUNT_KINDS,
  ESSENTIAL_BY_DEFAULT,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  INCOME_SOURCE_LABELS,
  INCOME_SOURCES,
  isDebt,
  type AccountKind,
} from "@/lib/domain/finance";
import {
  addExpenseAction,
  addForecastAction,
  addIncomeAction,
  archiveAccountAction,
  createAccountAction,
  deleteExpenseAction,
  deleteForecastAction,
  deleteIncomeAction,
  recordBalanceAction,
  saveSettingsAction,
} from "../server/actions";
import { loadFinance } from "../server/queries";
import { CashflowChart } from "./cashflow-chart";

const monthLabel = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" });
const pct = (r: number | null | undefined) => (r == null ? "—" : `${(r * 100).toFixed(1)}%`);

export async function FinanceDashboard() {
  const data = await loadFinance();
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const cur = data.settings.currency;
  const money = (n: number | null | undefined, digits = 0) => (n == null ? "—" : new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: digits }).format(n));
  const s = data.summary;
  const pos = data.position;
  const fi = data.fi;
  const thisMonth = `${data.today.slice(0, 7)}-01`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financial independence</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Actual figures come only from what you record ({cur}). Forecasts and projections are labelled as such and never mixed into actuals.
          {data.excludedProducts.length ? ` Products in other currencies aren't included: ${data.excludedProducts.join(", ")}.` : ""}
        </p>
      </div>

      <section aria-labelledby="actuals-h" className="flex flex-col gap-3">
        <h2 id="actuals-h" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Actual
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Net worth", money(pos.netWorth), pos.asOf ? `balances as of ${pos.asOf}` : "record account balances"],
            ["Debt outstanding", money(pos.debt), pos.debt > 0 ? "latest balances" : "none recorded"],
            ["Savings rate", pct(s.savingsRateLastMonth), `last month · ${pct(s.savingsRate3m)} over 3 months`],
            ["Recurring business income", money(data.recurringBusinessIncome.total), `${money(data.recurringBusinessIncome.productMrr)} product MRR + ${money(data.recurringBusinessIncome.otherRecurring)} other`],
            ["Annual income", money(s.annualIncome), "last 12 complete months"],
            ["Business profit", money(s.annualBusinessProfit), "last 12 months, after product and business costs"],
            ["Essential monthly expenses", money(s.essentialMonthly), "average of the last 3 months"],
            ["Emergency fund", money(pos.emergencyFund), `${pos.investable ? money(pos.investable) : "—"} investable`],
          ].map(([label, value, hint]) => (
            <div key={label} className="rounded-xl border bg-card p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              <dd className="text-[11px] text-muted-foreground">{hint}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financial independence target</CardTitle>
            <CardDescription>
              {fi.target
                ? `${money(fi.annualExpenses)} a year (${fi.annualExpensesSource}) ÷ ${data.settings.withdrawalRatePct}% withdrawal rate = ${money(fi.target)}`
                : "Record a few months of spending or enter your own annual-expenses estimate."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {fi.target ? (
              <>
                <Progress value={(fi.progress ?? 0) * 100} aria-label="Progress towards the FI target" />
                <p className="text-sm">
                  {money(pos.investable)} invested and saved of {money(fi.target)} <span className="text-muted-foreground">({pct(fi.progress)})</span>
                </p>
                <div className="rounded-lg border border-dashed p-3 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Projection</p>
                  {fi.projection?.reachable ? (
                    <p>
                      {fi.projection.months === 0 ? "Target reached." : `About ${Math.floor(fi.projection.months! / 12)} years ${fi.projection.months! % 12} months (${monthLabel(fi.projection.date!)})`}
                    </p>
                  ) : (
                    <p>Not reachable at the current saving rate.</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Assumes you keep saving {money(Math.max(0, s.avgMonthlySaving3m))} a month (3-month average) and returns average {data.settings.expectedReturnPct}% a year. A projection, not a promise.
                  </p>
                </div>
              </>
            ) : null}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Assumptions</summary>
              <ActionForm action={saveSettingsAction} submitLabel="Save assumptions" submitVariant="outline" resetOnSuccess={false} className="mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Withdrawal rate (%)" htmlFor="fs-wr" hint="Common rule of thumb: 3–4%">
                    <Input id="fs-wr" name="withdrawalRatePct" type="number" step="0.1" min="0.1" max="20" defaultValue={data.settings.withdrawalRatePct} required />
                  </Field>
                  <Field label="Annual expenses in independence" htmlFor="fs-ae" hint="Blank = last 3 months × 12">
                    <Input id="fs-ae" name="annualExpensesEstimate" type="number" step="1" min="1" defaultValue={data.settings.annualExpensesEstimate ?? ""} />
                  </Field>
                  <Field label="Expected return (% a year)" htmlFor="fs-er" hint="Used only for the projection">
                    <Input id="fs-er" name="expectedReturnPct" type="number" step="0.1" min="-20" max="30" defaultValue={data.settings.expectedReturnPct} required />
                  </Field>
                  <Field label="Emergency fund (months of essentials)" htmlFor="fs-em">
                    <Input id="fs-em" name="emergencyMonths" type="number" step="0.5" min="0" max="60" defaultValue={data.settings.emergencyMonths} required />
                  </Field>
                  <Field label="Currency" htmlFor="fs-cur">
                    <Input id="fs-cur" name="currency" maxLength={3} defaultValue={cur} required />
                  </Field>
                </div>
              </ActionForm>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Milestones</CardTitle>
            <CardDescription>Reached only when your recorded figures show it.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {data.milestones.map((m) => (
                <li key={m.key} className="flex items-start gap-2">
                  {m.achievedOn ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <div className="min-w-0">
                    <p className={m.achievedOn ? "font-medium" : ""}>
                      {m.label}
                      {m.achievedOn ? <span className="font-normal text-muted-foreground"> · {m.achievedOn.length === 10 && m.achievedOn.endsWith("-01") ? monthLabel(m.achievedOn) : m.achievedOn}</span> : null}
                      <span className="sr-only">{m.achievedOn ? " (reached)" : " (not yet)"}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{m.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Monthly actuals</CardTitle>
          <CardDescription>Product revenue and costs come from the product ledger. The current month is to date.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CashflowChart
            currency={cur}
            data={data.months.map((m) => ({ label: monthLabel(m.month) + (m.month === thisMonth ? " (to date)" : ""), income: m.totalIncome, expenses: m.expenses, savings: m.savings }))}
          />
          <div className="overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0}>
            <table className="w-full min-w-[880px] text-sm tabular-nums">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Month</th>
                  {INCOME_SOURCES.map((src) => (
                    <th key={src} className="py-1 text-right font-medium">
                      {INCOME_SOURCE_LABELS[src].replace(" revenue", "").replace(" income", "")}
                    </th>
                  ))}
                  <th className="py-1 text-right font-medium">Spending</th>
                  <th className="py-1 text-right font-medium">Essential</th>
                  <th className="py-1 text-right font-medium">Saved</th>
                  <th className="py-1 text-right font-medium">Rate</th>
                  <th className="py-1 text-right font-medium">Business profit</th>
                </tr>
              </thead>
              <tbody>
                {[...data.months].reverse().map((m) => (
                  <tr key={m.month} className="border-t">
                    <td className="py-1">
                      {monthLabel(m.month)}
                      {m.month === thisMonth ? <span className="text-[11px] text-muted-foreground"> to date</span> : null}
                    </td>
                    {INCOME_SOURCES.map((src) => (
                      <td key={src} className="py-1 text-right">
                        {m.income[src] ? money(m.income[src]) : "—"}
                      </td>
                    ))}
                    <td className="py-1 text-right">{money(m.expenses)}</td>
                    <td className="py-1 text-right">{money(m.essentialExpenses)}</td>
                    <td className={`py-1 text-right ${m.savings < 0 ? "text-destructive" : ""}`}>{money(m.savings)}</td>
                    <td className="py-1 text-right">{pct(m.savingsRate)}</td>
                    <td className={`py-1 text-right ${m.businessProfit < 0 ? "text-destructive" : ""}`}>{money(m.businessProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record income</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ActionForm action={addIncomeAction} submitLabel="Record income">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Source" htmlFor="fi-src">
                  <Select id="fi-src" name="source" defaultValue="salary">
                    {INCOME_SOURCES.filter((src) => src !== "product").map((src) => (
                      <option key={src} value={src}>
                        {INCOME_SOURCE_LABELS[src]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={`Amount (${cur})`} htmlFor="fi-amt">
                  <Input id="fi-amt" name="amount" type="number" step="0.01" min="0.01" inputMode="decimal" required />
                </Field>
                <Field label="Received" htmlFor="fi-date">
                  <Input id="fi-date" name="receivedOn" type="date" max={data.today} defaultValue={data.today} />
                </Field>
                <Field label="Note" htmlFor="fi-desc">
                  <Input id="fi-desc" name="description" maxLength={300} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="recurring" /> Recurring (retainer, subscription, salary)
              </label>
              <p className="text-xs text-muted-foreground">Product revenue is taken from your products&rsquo; ledgers, so it isn&rsquo;t entered here.</p>
            </ActionForm>
            <ul className="flex max-h-64 flex-col overflow-y-auto text-sm">
              {data.recentIncome.map((e) => (
                <li key={e.id} className="flex items-center gap-2 border-t py-1">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{e.receivedOn}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {INCOME_SOURCE_LABELS[e.source]}
                    {e.recurring ? " · recurring" : ""}
                    {e.description ? ` · ${e.description}` : ""}
                  </span>
                  <span className="tabular-nums">{money(e.amount, 2)}</span>
                  <form action={deleteIncomeAction.bind(null, e.id)}>
                    <SubmitButton variant="ghost" size="icon" className="size-8" aria-label={`Delete income from ${e.receivedOn}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record an expense</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ActionForm action={addExpenseAction} submitLabel="Record expense">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category" htmlFor="fe-cat">
                  <Select id="fe-cat" name="category" defaultValue="food">
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {EXPENSE_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={`Amount (${cur})`} htmlFor="fe-amt">
                  <Input id="fe-amt" name="amount" type="number" step="0.01" min="0.01" inputMode="decimal" required />
                </Field>
                <Field label="Date" htmlFor="fe-date">
                  <Input id="fe-date" name="spentOn" type="date" max={data.today} defaultValue={data.today} />
                </Field>
                <Field label="Essential?" htmlFor="fe-ess" hint={`Default: ${ESSENTIAL_BY_DEFAULT.map((c) => EXPENSE_CATEGORY_LABELS[c].toLowerCase()).slice(0, 4).join(", ")}…`}>
                  <Select id="fe-ess" name="essential" defaultValue="">
                    <option value="">By category</option>
                    <option value="yes">Essential</option>
                    <option value="no">Not essential</option>
                  </Select>
                </Field>
                <Field label="Note" htmlFor="fe-desc" className="col-span-2">
                  <Input id="fe-desc" name="description" maxLength={300} />
                </Field>
              </div>
            </ActionForm>
            <ul className="flex max-h-64 flex-col overflow-y-auto text-sm">
              {data.recentExpenses.map((e) => (
                <li key={e.id} className="flex items-center gap-2 border-t py-1">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{e.spentOn}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {EXPENSE_CATEGORY_LABELS[e.category]}
                    {e.essential ? " · essential" : ""}
                    {e.description ? ` · ${e.description}` : ""}
                  </span>
                  <span className="tabular-nums">{money(e.amount, 2)}</span>
                  <form action={deleteExpenseAction.bind(null, e.id)}>
                    <SubmitButton variant="ghost" size="icon" className="size-8" aria-label={`Delete expense from ${e.spentOn}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accounts and debts</CardTitle>
            <CardDescription>Update balances from your statements. Debts are entered as the amount owed.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.accounts.length === 0 ? <p className="text-sm text-muted-foreground">No accounts yet.</p> : null}
            <ul className="flex flex-col gap-2">
              {data.accounts.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 font-medium">{a.name}</span>
                    <Badge variant={isDebt(a.kind as AccountKind) ? "warning" : "outline"}>{ACCOUNT_KIND_LABELS[a.kind as AccountKind]}</Badge>
                    <span className="tabular-nums">{a.latest ? money(a.latest.balance, 2) : "—"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.latest ? `as of ${a.latest.asOf}` : "no balance yet"}
                    {a.interestRatePct != null ? ` · ${a.interestRatePct}% interest` : ""}
                  </p>
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <ActionForm action={recordBalanceAction.bind(null, a.id)} submitLabel="Update" submitVariant="outline" inline submitClassName="h-9">
                        <Input name="balance" type="number" step="0.01" min="0" inputMode="decimal" required aria-label={`New balance for ${a.name}`} placeholder="Balance" className="h-9 min-w-0" />
                        <Input name="asOf" type="date" max={data.today} defaultValue={data.today} aria-label="As of" className="h-9 w-36" />
                      </ActionForm>
                    </div>
                    <form action={archiveAccountAction.bind(null, a.id)}>
                      <SubmitButton variant="ghost" size="sm" className="h-9 text-xs">
                        Archive
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Add an account or debt</summary>
              <ActionForm action={createAccountAction} submitLabel="Add" submitVariant="outline" className="mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name" htmlFor="fa-name">
                    <Input id="fa-name" name="name" required maxLength={120} />
                  </Field>
                  <Field label="Type" htmlFor="fa-kind">
                    <Select id="fa-kind" name="kind" defaultValue="savings">
                      {ACCOUNT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {ACCOUNT_KIND_LABELS[k]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Balance today" htmlFor="fa-bal">
                    <Input id="fa-bal" name="balance" type="number" step="0.01" min="0" inputMode="decimal" />
                  </Field>
                  <Field label="Interest rate (%)" htmlFor="fa-rate">
                    <Input id="fa-rate" name="interestRatePct" type="number" step="0.01" min="0" />
                  </Field>
                </div>
              </ActionForm>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Forecast vs actual</CardTitle>
            <CardDescription>Plans you enter, shown next to what actually happened. Forecasts never change the actual figures.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0}>
              <table className="w-full min-w-[420px] text-sm tabular-nums">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Month</th>
                    <th className="py-1 text-right font-medium">Income plan</th>
                    <th className="py-1 text-right font-medium">Actual</th>
                    <th className="py-1 text-right font-medium">Spending plan</th>
                    <th className="py-1 text-right font-medium">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {data.plan.map((p) => (
                    <tr key={p.month} className="border-t">
                      <td className="py-1">
                        {monthLabel(p.month)}
                        {p.partial ? <span className="text-[11px] text-muted-foreground"> to date</span> : null}
                      </td>
                      <td className="py-1 text-right italic text-muted-foreground">{p.forecastIncome ? money(p.forecastIncome) : "—"}</td>
                      <td className="py-1 text-right">{p.actualIncome == null ? "" : money(p.actualIncome)}</td>
                      <td className="py-1 text-right italic text-muted-foreground">{p.forecastExpenses ? money(p.forecastExpenses) : "—"}</td>
                      <td className="py-1 text-right">{p.actualExpenses == null ? "" : money(p.actualExpenses)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col gap-1 text-xs">
              {data.plan
                .flatMap((p) => p.items)
                .map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-muted-foreground">{monthLabel(f.month)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {f.kind === "income" ? "+" : "−"} {f.label}
                    </span>
                    <span className="tabular-nums">{money(f.amount)}</span>
                    <form action={deleteForecastAction.bind(null, f.id)}>
                      <SubmitButton variant="ghost" size="icon" className="size-7" aria-label={`Delete forecast ${f.label}`}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </SubmitButton>
                    </form>
                  </li>
                ))}
            </ul>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Add a forecast</summary>
              <ActionForm action={addForecastAction} submitLabel="Add forecast" submitVariant="outline" className="mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Month" htmlFor="ff-month">
                    <Input id="ff-month" name="month" type="month" required defaultValue={data.today.slice(0, 7)} />
                  </Field>
                  <Field label="Type" htmlFor="ff-kind">
                    <Select id="ff-kind" name="kind" defaultValue="income">
                      <option value="income">Expected income</option>
                      <option value="expense">Expected spending</option>
                    </Select>
                  </Field>
                  <Field label="What" htmlFor="ff-label">
                    <Input id="ff-label" name="label" required maxLength={200} placeholder="e.g. Consulting retainer" />
                  </Field>
                  <Field label={`Amount (${cur})`} htmlFor="ff-amt">
                    <Input id="ff-amt" name="amount" type="number" step="0.01" min="0.01" inputMode="decimal" required />
                  </Field>
                </div>
              </ActionForm>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
