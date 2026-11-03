import { Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  BUSINESS_MODEL_LABELS,
  EXPENSE_CATEGORIES,
  FEATURE_PRIORITIES,
  FEATURE_PRIORITY_LABELS,
  FEATURE_STATUS_LABELS,
  FEATURE_STATUSES,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KINDS,
  FEEDBACK_SOURCES,
  formatMoney,
  formatPct,
  churnRate,
  MILESTONE_STATUSES,
  PRODUCT_STAGE_LABELS,
  PRODUCT_STAGES,
  RECOMMENDATION_LABELS,
  REVENUE_CATEGORIES,
  SENTIMENTS,
  TRANSACTION_CATEGORY_LABELS,
  type TransactionCategory,
} from "@/lib/domain/products";
import type { Collection } from "../schemas";
import { createItemAction, deleteItemAction, setItemFieldAction, updateProductAction } from "../server/actions";
import type { loadProduct } from "../server/queries";
import { AutoSubmitSelect } from "./auto-submit-select";
import { FinanceChart } from "./finance-chart";
import { ProductForm } from "./product-form";

type Data = Awaited<ReturnType<typeof loadProduct>>;

const monthLabel = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" });
const human = (s: string) => (s[0].toUpperCase() + s.slice(1)).replace(/_/g, " ");

function DeleteButton({ productId, collection, itemId, label }: { productId: string; collection: Collection; itemId: string; label: string }) {
  return (
    <form action={deleteItemAction.bind(null, productId, collection, itemId)}>
      <SubmitButton variant="ghost" size="icon" className="size-8" aria-label={label}>
        <Trash2 className="size-4" aria-hidden />
      </SubmitButton>
    </form>
  );
}

function Stat({ label, value, hint, negative }: { label: string; value: string; hint?: string; negative?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-xl font-semibold tabular-nums ${negative ? "text-destructive" : ""}`}>{value}</dd>
      {hint ? <dd className="text-[11px] text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function OverviewTab({ data }: { data: Data }) {
  const p = data.product;
  const a = data.assessment;
  const m = data.latestMetrics;
  const cur = p.currency;
  return (
    <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label={`MRR${m ? ` · ${monthLabel(m.month)}` : ""}`} value={formatMoney(m?.mrr, cur)} hint={m ? "latest recorded month" : "no metrics recorded"} />
          <Stat label="Active customers" value={m ? String(m.activeCustomers) : "—"} hint={m ? `churn ${formatPct(m.churnRate)} that month` : undefined} />
          <Stat label="Total revenue" value={formatMoney(data.lifetime.netRevenue, cur)} hint={data.lifetime.refunds ? `after ${formatMoney(data.lifetime.refunds, cur)} refunds` : "lifetime, net"} />
          <Stat label="Expenses" value={formatMoney(data.lifetime.expenses, cur)} hint="lifetime" />
          <Stat label="Profit" value={formatMoney(data.lifetime.profit, cur)} hint="lifetime" negative={data.lifetime.profit < 0} />
          <Stat label="Profit, last 3 months" value={formatMoney(data.recent3Months.profit, cur)} negative={data.recent3Months.profit < 0} />
        </dl>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommendation: {RECOMMENDATION_LABELS[a.recommendation]}</CardTitle>
            <CardDescription>Confidence {a.confidence}, from {a.signals.monthsOfData} month(s) of recorded metrics. Rules are in docs/15.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 text-sm">
              {a.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <MilestonesCard data={data} />

        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer font-semibold">Edit product details</summary>
          <div className="mt-3">
            <ProductForm action={updateProductAction.bind(null, p.id)} initial={p} submitLabel="Save" today={data.today} baseCurrency={cur} goals={data.goals} />
          </div>
        </details>
      </div>

      <aside className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Business</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2 text-sm">
              {[
                ["Target customer", p.targetCustomer],
                ["Problem", p.problem],
                ["Value proposition", p.valueProposition],
                ["Business model", BUSINESS_MODEL_LABELS[p.businessModel]],
                ["Pricing", p.pricing],
                ["Acquisition channels", p.acquisitionChannels.join(", ")],
                ["Started", p.startedOn],
                ["Planned launch (forecast)", p.plannedLaunchOn],
                ["Launched (actual)", p.launchedOn],
                ["Currency", p.currency],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="whitespace-pre-wrap">{v}</dd>
                  </div>
                ))}
              {data.goal ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Contributes to</dt>
                  <dd>
                    <Link className="underline-offset-2 hover:underline" href={`/goals/${data.goal.id}`}>
                      {data.goal.title}
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stage history</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-1 text-sm">
              {data.stageEvents.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>{PRODUCT_STAGE_LABELS[e.toStage]}</span>
                  <span className="text-muted-foreground">{e.changedOn}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function MilestonesCard({ data }: { data: Data }) {
  const pid = data.product.id;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Milestones</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data.milestones.length === 0 ? <p className="text-sm text-muted-foreground">No milestones yet.</p> : null}
        <ul className="flex flex-col gap-2">
          {data.milestones.map((ms) => {
            const overdue = ms.status === "open" && ms.dueOn != null && ms.dueOn < data.today;
            return (
              <li key={ms.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                <span className={ms.status === "done" ? "text-muted-foreground line-through" : "font-medium"}>{ms.title}</span>
                {ms.stage ? <Badge variant="outline">{PRODUCT_STAGE_LABELS[ms.stage]}</Badge> : null}
                {overdue ? <Badge variant="warning">Overdue</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  {ms.status === "done" ? `done ${ms.completedOn}` : ms.dueOn ? `due ${ms.dueOn}` : ""}
                </span>
                <form action={setItemFieldAction.bind(null, pid, "milestones", ms.id)} className="ml-auto">
                  <AutoSubmitSelect name="status" defaultValue={ms.status} key={ms.status} aria-label={`Status of ${ms.title}`} className="h-8 w-28 text-xs">
                    {MILESTONE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {human(s)}
                      </option>
                    ))}
                  </AutoSubmitSelect>
                </form>
                <DeleteButton productId={pid} collection="milestones" itemId={ms.id} label={`Delete ${ms.title}`} />
              </li>
            );
          })}
        </ul>
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">Add a milestone</summary>
          <ActionForm action={createItemAction.bind(null, pid, "milestones")} submitLabel="Add milestone" submitVariant="outline" className="mt-3">
            <Field label="Milestone" htmlFor="m-title">
              <Input id="m-title" name="title" required maxLength={200} placeholder="e.g. 10 paying beta customers" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Due" htmlFor="m-due">
                <Input id="m-due" name="dueOn" type="date" />
              </Field>
              <Field label="Stage" htmlFor="m-stage">
                <Select id="m-stage" name="stage" defaultValue="">
                  <option value="">Any</option>
                  {PRODUCT_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {PRODUCT_STAGE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </ActionForm>
        </details>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function FinanceTab({ data }: { data: Data }) {
  const pid = data.product.id;
  const cur = data.product.currency;
  const r = data.report;
  const currentMonth = `${data.today.slice(0, 7)}-01`;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue and expense report</CardTitle>
          <CardDescription>
            {r.from} to {r.to}. Actuals only: entries you recorded, nothing projected.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-wrap items-end gap-2" action={`/products/${pid}`}>
            <input type="hidden" name="tab" value="finance" />
            <Field label="From" htmlFor="r-from">
              <Input id="r-from" name="from" type="date" defaultValue={r.from} className="w-40" />
            </Field>
            <Field label="To" htmlFor="r-to">
              <Input id="r-to" name="to" type="date" defaultValue={r.to} max={data.today} className="w-40" />
            </Field>
            <SubmitButton variant="outline" className="h-9">
              Show
            </SubmitButton>
          </form>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Revenue" value={formatMoney(r.totals.revenue, cur)} hint={r.totals.refunds ? `${formatMoney(r.totals.refunds, cur)} refunded` : undefined} />
            <Stat label="Net revenue" value={formatMoney(r.totals.netRevenue, cur)} />
            <Stat label="Expenses" value={formatMoney(r.totals.expenses, cur)} />
            <Stat label="Profit" value={formatMoney(r.totals.profit, cur)} negative={r.totals.profit < 0} />
          </dl>
          <FinanceChart
            currency={cur}
            data={r.months.map((m) => ({ label: monthLabel(m.month) + (m.month === currentMonth ? " (to date)" : ""), netRevenue: m.netRevenue, expenses: m.expenses, profit: m.profit }))}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm tabular-nums">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Month</th>
                  <th className="py-1 text-right font-medium">Revenue</th>
                  <th className="py-1 text-right font-medium">Refunds</th>
                  <th className="py-1 text-right font-medium">Expenses</th>
                  <th className="py-1 text-right font-medium">Profit</th>
                  <th className="py-1 text-right font-medium">Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {r.months.map((m) => (
                  <tr key={m.month} className="border-t">
                    <td className="py-1">
                      {monthLabel(m.month)}
                      {m.month === currentMonth ? <span className="text-xs text-muted-foreground"> to date</span> : null}
                    </td>
                    <td className="py-1 text-right">{formatMoney(m.revenue, cur)}</td>
                    <td className="py-1 text-right">{m.refunds ? formatMoney(m.refunds, cur) : "—"}</td>
                    <td className="py-1 text-right">{formatMoney(m.expenses, cur)}</td>
                    <td className={`py-1 text-right ${m.profit < 0 ? "text-destructive" : ""}`}>{formatMoney(m.profit, cur)}</td>
                    <td className={`py-1 text-right ${m.cumulativeProfit < 0 ? "text-destructive" : ""}`}>{formatMoney(m.cumulativeProfit, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.keys(r.byCategory).length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["Revenue by category", REVENUE_CATEGORIES],
                  ["Expenses by category", EXPENSE_CATEGORIES],
                ] as const
              ).map(([title, cats]) => (
                <div key={title}>
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">{title}</h3>
                  <ul className="text-sm">
                    {cats
                      .filter((c) => r.byCategory[c])
                      .map((c) => (
                        <li key={c} className="flex justify-between border-t py-1">
                          <span>{TRANSACTION_CATEGORY_LABELS[c]}</span>
                          <span className="tabular-nums">{formatMoney(r.byCategory[c], cur)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Record revenue or an expense</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ActionForm action={createItemAction.bind(null, pid, "transactions")} submitLabel="Record">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category" htmlFor="t-cat" className="col-span-2">
                  <Select id="t-cat" name="category" defaultValue="subscription">
                    <optgroup label="Revenue">
                      {REVENUE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {TRANSACTION_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Expense">
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {TRANSACTION_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </optgroup>
                  </Select>
                </Field>
                <Field label={`Amount (${cur})`} htmlFor="t-amount">
                  <Input id="t-amount" name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" required />
                </Field>
                <Field label="Date" htmlFor="t-date">
                  <Input id="t-date" name="occurredOn" type="date" max={data.today} defaultValue={data.today} />
                </Field>
                <Field label="Description" htmlFor="t-desc" className="col-span-2">
                  <Input id="t-desc" name="description" maxLength={500} placeholder="e.g. Stripe payout, AWS bill" />
                </Field>
              </div>
            </ActionForm>
            <ul className="flex max-h-96 flex-col overflow-y-auto text-sm">
              {r.transactions.map((t) => (
                <li key={t.id} className="flex items-center gap-2 border-t py-1">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{t.occurredOn}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {TRANSACTION_CATEGORY_LABELS[t.category as TransactionCategory]}
                    {t.description ? ` · ${t.description}` : ""}
                  </span>
                  <span className={`tabular-nums ${t.kind === "expense" || t.category === "refund" ? "text-muted-foreground" : ""}`}>
                    {t.kind === "expense" || t.category === "refund" ? "−" : "+"}
                    {formatMoney(t.amount, cur)}
                  </span>
                  <DeleteButton productId={pid} collection="transactions" itemId={t.id} label="Delete entry" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly customers and MRR</CardTitle>
            <CardDescription>Record each month from your billing system. Recording a month again corrects it.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ActionForm action={createItemAction.bind(null, pid, "metrics")} submitLabel="Save month">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Month" htmlFor="mm-month">
                  <Input id="mm-month" name="month" type="month" max={data.today.slice(0, 7)} defaultValue={data.today.slice(0, 7)} required />
                </Field>
                <Field label={`MRR at month end (${cur})`} htmlFor="mm-mrr">
                  <Input id="mm-mrr" name="mrr" type="number" inputMode="decimal" step="0.01" min="0" />
                </Field>
                <Field label="Active customers (end)" htmlFor="mm-active">
                  <Input id="mm-active" name="activeCustomers" type="number" inputMode="numeric" min="0" required />
                </Field>
                <Field label="New customers" htmlFor="mm-new">
                  <Input id="mm-new" name="newCustomers" type="number" inputMode="numeric" min="0" defaultValue="0" />
                </Field>
                <Field label="Customers lost" htmlFor="mm-churn">
                  <Input id="mm-churn" name="churnedCustomers" type="number" inputMode="numeric" min="0" defaultValue="0" />
                </Field>
              </div>
            </ActionForm>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm tabular-nums">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Month</th>
                    <th className="py-1 text-right font-medium">MRR</th>
                    <th className="py-1 text-right font-medium">Customers</th>
                    <th className="py-1 text-right font-medium">New</th>
                    <th className="py-1 text-right font-medium">Lost</th>
                    <th className="py-1 text-right font-medium">Churn</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.metrics.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="py-1">{monthLabel(m.month)}</td>
                      <td className="py-1 text-right">{formatMoney(m.mrr, cur)}</td>
                      <td className="py-1 text-right">{m.activeCustomers}</td>
                      <td className="py-1 text-right">{m.newCustomers}</td>
                      <td className="py-1 text-right">{m.churnedCustomers}</td>
                      <td className="py-1 text-right">{formatPct(churnRate(m))}</td>
                      <td className="text-right">
                        <DeleteButton productId={pid} collection="metrics" itemId={m.id} label={`Delete ${monthLabel(m.month)}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function BuildTab({ data }: { data: Data }) {
  const pid = data.product.id;
  const releaseOptions = (
    <>
      <option value="">No release</option>
      {data.releases.map((r) => (
        <option key={r.id} value={r.id}>
          {r.version}
        </option>
      ))}
    </>
  );
  const byStatus = FEATURE_STATUSES.map((s) => [s, data.features.filter((f) => f.feature.status === s)] as const).filter(([, list]) => list.length);
  const bugs = [...data.bugs].sort((a, b) => Number(!["open", "in_progress"].includes(a.status)) - Number(!["open", "in_progress"].includes(b.status)) || BUG_SEVERITIES.indexOf(a.severity) - BUG_SEVERITIES.indexOf(b.severity));
  return (
    <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Feature backlog</CardTitle>
          <CardDescription>Requests count customer feedback linked to each feature.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {byStatus.length === 0 ? <p className="text-sm text-muted-foreground">The backlog is empty.</p> : null}
          {byStatus.map(([status, list]) => (
            <section key={status}>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {FEATURE_STATUS_LABELS[status]} · {list.length}
              </h3>
              <ul className="flex flex-col gap-2">
                {list.map(({ feature: f, requests }) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                    <span className="min-w-0 flex-1 font-medium">{f.title}</span>
                    <Badge variant={f.priority === "must" ? "default" : "outline"}>{FEATURE_PRIORITY_LABELS[f.priority]}</Badge>
                    {f.impact || f.effort ? (
                      <span className="text-xs text-muted-foreground">
                        impact {f.impact ?? "?"} · effort {f.effort ?? "?"}
                      </span>
                    ) : null}
                    {requests ? <Badge variant="secondary">{requests} request{requests === 1 ? "" : "s"}</Badge> : null}
                    {f.shippedOn ? <span className="text-xs text-muted-foreground">shipped {f.shippedOn}</span> : null}
                    <form action={setItemFieldAction.bind(null, pid, "features", f.id)} className="flex gap-1">
                      <AutoSubmitSelect name="status" defaultValue={f.status} key={`s${f.status}`} aria-label={`Status of ${f.title}`} className="h-8 w-28 text-xs">
                        {FEATURE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {FEATURE_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                      <AutoSubmitSelect name="releaseId" defaultValue={f.releaseId ?? ""} key={`r${f.releaseId}`} aria-label={`Release of ${f.title}`} className="h-8 w-28 text-xs">
                        {releaseOptions}
                      </AutoSubmitSelect>
                    </form>
                    <DeleteButton productId={pid} collection="features" itemId={f.id} label={`Delete ${f.title}`} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a feature</summary>
            <ActionForm action={createItemAction.bind(null, pid, "features")} submitLabel="Add feature" submitVariant="outline" className="mt-3">
              <Field label="Feature" htmlFor="f-title">
                <Input id="f-title" name="title" required maxLength={200} />
              </Field>
              <Field label="Description" htmlFor="f-desc">
                <Textarea id="f-desc" name="description" rows={2} />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Priority" htmlFor="f-priority">
                  <Select id="f-priority" name="priority" defaultValue="should">
                    {FEATURE_PRIORITIES.map((s) => (
                      <option key={s} value={s}>
                        {FEATURE_PRIORITY_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Impact 1–5" htmlFor="f-impact">
                  <Input id="f-impact" name="impact" type="number" min="1" max="5" />
                </Field>
                <Field label="Effort 1–5" htmlFor="f-effort">
                  <Input id="f-effort" name="effort" type="number" min="1" max="5" />
                </Field>
              </div>
            </ActionForm>
          </details>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Releases</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2 text-sm">
              {data.releases.map((r) => {
                const shipped = data.features.filter((f) => f.feature.releaseId === r.id).length;
                const fixed = data.bugs.filter((b) => b.releaseId === r.id).length;
                return (
                  <li key={r.id} className="flex items-center gap-2 rounded-lg border p-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {r.version}
                        {r.title ? ` · ${r.title}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.releasedOn ? `released ${r.releasedOn}` : r.plannedOn ? `planned ${r.plannedOn}` : "not released"} · {shipped} feature(s), {fixed} bug(s)
                      </p>
                    </div>
                    {!r.releasedOn ? (
                      <form action={setItemFieldAction.bind(null, pid, "releases", r.id)}>
                        <input type="hidden" name="releasedOn" value={data.today} />
                        <SubmitButton variant="outline" size="sm">
                          Released today
                        </SubmitButton>
                      </form>
                    ) : null}
                    <DeleteButton productId={pid} collection="releases" itemId={r.id} label={`Delete ${r.version}`} />
                  </li>
                );
              })}
            </ul>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Add a release</summary>
              <ActionForm action={createItemAction.bind(null, pid, "releases")} submitLabel="Add release" submitVariant="outline" className="mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Version" htmlFor="r-version">
                    <Input id="r-version" name="version" required maxLength={40} placeholder="1.2.0" />
                  </Field>
                  <Field label="Title" htmlFor="r-title">
                    <Input id="r-title" name="title" maxLength={200} />
                  </Field>
                  <Field label="Planned (forecast)" htmlFor="r-planned">
                    <Input id="r-planned" name="plannedOn" type="date" />
                  </Field>
                  <Field label="Released (actual)" htmlFor="r-released">
                    <Input id="r-released" name="releasedOn" type="date" max={data.today} />
                  </Field>
                </div>
                <Field label="Release notes" htmlFor="r-notes">
                  <Textarea id="r-notes" name="notes" rows={2} />
                </Field>
              </ActionForm>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bugs</CardTitle>
            <CardDescription>{data.bugs.filter((b) => b.status === "open" || b.status === "in_progress").length} open</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2 text-sm">
              {bugs.map((b) => (
                <li key={b.id} className="flex flex-col gap-1 rounded-lg border p-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={b.severity === "critical" ? "destructive" : b.severity === "high" ? "warning" : "outline"}>{human(b.severity)}</Badge>
                    <span className={`min-w-0 flex-1 ${b.status === "fixed" || b.status === "wont_fix" ? "text-muted-foreground line-through" : "font-medium"}`}>{b.title}</span>
                    <DeleteButton productId={pid} collection="bugs" itemId={b.id} label={`Delete ${b.title}`} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="min-w-32 flex-1 text-xs text-muted-foreground">
                      reported {b.reportedOn}
                      {b.fixedOn ? ` · fixed ${b.fixedOn}` : ""}
                    </span>
                    <form action={setItemFieldAction.bind(null, pid, "bugs", b.id)} className="flex gap-1">
                      <AutoSubmitSelect name="status" defaultValue={b.status} key={`s${b.status}`} aria-label={`Status of ${b.title}`} className="h-8 w-28 text-xs">
                        {BUG_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {human(s)}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                      <AutoSubmitSelect name="releaseId" defaultValue={b.releaseId ?? ""} key={`r${b.releaseId}`} aria-label={`Fixed in release for ${b.title}`} className="h-8 w-28 text-xs">
                        {releaseOptions}
                      </AutoSubmitSelect>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Report a bug</summary>
              <ActionForm action={createItemAction.bind(null, pid, "bugs")} submitLabel="Add bug" submitVariant="outline" className="mt-3">
                <Field label="Bug" htmlFor="b-title">
                  <Input id="b-title" name="title" required maxLength={200} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Severity" htmlFor="b-sev">
                    <Select id="b-sev" name="severity" defaultValue="medium">
                      {BUG_SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {human(s)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Reported" htmlFor="b-date">
                    <Input id="b-date" name="reportedOn" type="date" max={data.today} defaultValue={data.today} />
                  </Field>
                </div>
                <Field label="Steps / details" htmlFor="b-desc">
                  <Textarea id="b-desc" name="description" rows={2} />
                </Field>
              </ActionForm>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function FeedbackTab({ data }: { data: Data }) {
  const pid = data.product.id;
  const counts = (key: "kind" | "sentiment") =>
    data.feedback.reduce<Record<string, number>>((acc, f) => {
      acc[f[key]] = (acc[f[key]] ?? 0) + 1;
      return acc;
    }, {});
  const kinds = counts("kind");
  const sentiments = counts("sentiment");
  return (
    <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <p className="text-sm text-muted-foreground">
          {data.feedback.length} piece(s) recorded · {data.feedbackLast90} in the last 90 days ·{" "}
          {SENTIMENTS.map((s) => `${sentiments[s] ?? 0} ${s}`).join(", ")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FEEDBACK_KINDS.filter((k) => kinds[k]).map((k) => (
            <Badge key={k} variant="outline">
              {FEEDBACK_KIND_LABELS[k]}: {kinds[k]}
            </Badge>
          ))}
        </div>
        <ul className="flex flex-col gap-2">
          {data.feedback.map((f) => {
            const feature = data.features.find((x) => x.feature.id === f.featureId)?.feature;
            return (
              <li key={f.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={f.sentiment === "positive" ? "success" : f.sentiment === "negative" ? "destructive" : "outline"}>{FEEDBACK_KIND_LABELS[f.kind]}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {f.receivedOn} · {human(f.source)}
                    {f.customer ? ` · ${f.customer}` : ""}
                  </span>
                  <span className="ml-auto">
                    <DeleteButton productId={pid} collection="feedback" itemId={f.id} label="Delete feedback" />
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{f.content}</p>
                {feature ? <p className="text-xs text-muted-foreground">Linked to: {feature.title}</p> : null}
              </li>
            );
          })}
        </ul>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record feedback</CardTitle>
          <CardDescription>Write what the customer actually said.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createItemAction.bind(null, pid, "feedback")} submitLabel="Save feedback">
            <Field label="What they said" htmlFor="fb-content">
              <Textarea id="fb-content" name="content" rows={3} required maxLength={5000} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" htmlFor="fb-kind">
                <Select id="fb-kind" name="kind" defaultValue="feature_request">
                  {FEEDBACK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {FEEDBACK_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sentiment" htmlFor="fb-sent">
                <Select id="fb-sent" name="sentiment" defaultValue="neutral">
                  {SENTIMENTS.map((s) => (
                    <option key={s} value={s}>
                      {human(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Source" htmlFor="fb-source">
                <Select id="fb-source" name="source" defaultValue="email">
                  {FEEDBACK_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {human(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" htmlFor="fb-date">
                <Input id="fb-date" name="receivedOn" type="date" max={data.today} defaultValue={data.today} />
              </Field>
            </div>
            <Field label="Customer" htmlFor="fb-customer">
              <Input id="fb-customer" name="customer" maxLength={200} />
            </Field>
            <Field label="Related feature" htmlFor="fb-feature">
              <Select id="fb-feature" name="featureId" defaultValue="">
                <option value="">None</option>
                {data.features.map(({ feature: f }) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </Select>
            </Field>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
