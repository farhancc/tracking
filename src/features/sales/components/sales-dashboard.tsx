import { ArrowDown, ArrowUp, Phone, Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Progress } from "@/components/ui/progress";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { formatMeasure } from "@/lib/domain/goals";
import {
  ACTIVITY_KIND_LABELS,
  ACTIVITY_KINDS,
  CALL_OUTCOME_LABELS,
  CALL_OUTCOMES,
  DEAL_STAGE_LABELS,
  LOWER_IS_BETTER,
  OPEN_DEAL_STAGES,
  PROSPECT_STATUS_LABELS,
  RATE_LABELS,
  SALES_METRIC_LABELS,
  SALES_PERIOD_LABELS,
  SALES_PERIODS,
  type ActivityKind,
  type DealStage,
  type ProspectStatus,
  type SalesPeriod,
} from "@/lib/domain/sales";
import { cn } from "@/lib/utils";
import {
  closeDealAction,
  createDealAction,
  createProspectAction,
  createTrackAction,
  deleteActivityAction,
  logActivityAction,
  logCallAction,
  logQuickActivityAction,
  moveDealAction,
  setFollowUpAction,
  setTargetAction,
} from "../server/actions";
import { loadSalesDashboard } from "../server/queries";
import { SalesTrendChart } from "./sales-trend-chart";

const money = (amounts: Record<string, number>) =>
  Object.keys(amounts).length ? Object.entries(amounts).map(([c, v]) => formatMeasure(v, "currency", c)).join(" + ") : "–";

function href(q: { period: SalesPeriod; anchor?: string; track?: string | null }) {
  const p = new URLSearchParams({ period: q.period });
  if (q.anchor) p.set("anchor", q.anchor);
  if (q.track) p.set("track", q.track);
  return `/sales?${p.toString()}`;
}

function Delta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null || current === previous) return null;
  const up = current > previous;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center text-xs", up ? "text-success" : "text-destructive")}>
      <Icon className="size-3" aria-hidden />
      {Math.abs(Math.round((current - previous) * 10) / 10)} pts
    </span>
  );
}

export async function SalesDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const period = (SALES_PERIODS as readonly string[]).includes(String(params.period)) ? (params.period as SalesPeriod) : "week";
  const anchor = typeof params.anchor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.anchor) ? params.anchor : undefined;
  const trackParam = typeof params.track === "string" && /^[0-9a-f-]{36}$/i.test(params.track) ? params.track : undefined;
  const data = await loadSalesDashboard({ period, anchor, trackId: trackParam });
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;

  const track = data.track;
  const logTrack = track?.id ?? data.tracks.find((t) => t.isDefault)?.id ?? null;
  const trackCurrency = track?.currency ?? data.tracks.find((t) => t.isDefault)?.currency ?? "USD";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sales mastery</h1>
            <p className="text-sm text-muted-foreground">
              {data.label}
              {data.isCurrent ? " · current" : ""}
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href={href({ period, anchor: data.previousAnchor, track: track?.id })} className="rounded-md border px-3 py-1.5 hover:bg-accent">
              ← Previous
            </Link>
            {!data.isCurrent ? (
              <Link href={href({ period, track: track?.id })} className="rounded-md border px-3 py-1.5 hover:bg-accent">
                Now
              </Link>
            ) : null}
            <Link href={href({ period, anchor: data.nextAnchor, track: track?.id })} className="rounded-md border px-3 py-1.5 hover:bg-accent">
              Next →
            </Link>
          </div>
        </div>
        <nav aria-label="Period" className="flex flex-wrap gap-1.5">
          {SALES_PERIODS.map((p) => (
            <Link
              key={p}
              href={href({ period: p, anchor, track: track?.id })}
              aria-current={p === period ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1 text-xs", p === period ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              {SALES_PERIOD_LABELS[p]}
            </Link>
          ))}
          <span className="mx-1 border-l" aria-hidden />
          <Link
            href={href({ period, anchor })}
            aria-current={!track ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-xs", !track ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            All tracks
          </Link>
          {data.tracks.map((t) => (
            <Link
              key={t.id}
              href={href({ period, anchor, track: t.id })}
              aria-current={track?.id === t.id ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1 text-xs", track?.id === t.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              {t.name} · {t.currency}
            </Link>
          ))}
          <Link href="/sales/journal" className="ml-auto rounded-full border px-3 py-1 text-xs hover:bg-accent">
            Learning journal →
          </Link>
        </nav>
      </div>

      {/* Quick log: one tap per real-world activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="size-4" aria-hidden /> Log a cold call: one tap per call
          </CardTitle>
          <CardDescription>Each outcome includes the steps before it. Logged to {track?.name ?? data.tracks.find((t) => t.isDefault)?.name}.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {CALL_OUTCOMES.map((o) => (
              <form key={o} action={logCallAction.bind(null, logTrack, o)}>
                <SubmitButton variant={o === "meeting_booked" ? "default" : "outline"} className="h-12 w-full" pendingText="…">
                  {CALL_OUTCOME_LABELS[o]}
                </SubmitButton>
              </form>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <form action={logQuickActivityAction.bind(null, logTrack, "prospecting", false)}>
              <SubmitButton variant="outline" className="h-11 w-full text-xs">Outreach sent</SubmitButton>
            </form>
            <form action={logQuickActivityAction.bind(null, logTrack, "prospecting", true)}>
              <SubmitButton variant="outline" className="h-11 w-full text-xs">Outreach replied</SubmitButton>
            </form>
            <form action={logQuickActivityAction.bind(null, logTrack, "follow_up", false)}>
              <SubmitButton variant="outline" className="h-11 w-full text-xs">Follow-up, no reply</SubmitButton>
            </form>
            <form action={logQuickActivityAction.bind(null, logTrack, "follow_up", true)}>
              <SubmitButton variant="outline" className="h-11 w-full text-xs">Follow-up, replied</SubmitButton>
            </form>
          </div>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Detailed log (prospect, quotation, meeting, past date)</summary>
            <ActionForm action={logActivityAction.bind(null, logTrack)} submitLabel="Log activity" submitVariant="outline" className="mt-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Activity" htmlFor="la-kind">
                  <Select id="la-kind" name="kind" defaultValue="cold_call">
                    {ACTIVITY_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {ACTIVITY_KIND_LABELS[k as ActivityKind]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Call outcome" htmlFor="la-outcome">
                  <Select id="la-outcome" name="outcome" defaultValue="no_answer">
                    {CALL_OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {CALL_OUTCOME_LABELS[o]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Prospect" htmlFor="la-prospect">
                  <Select id="la-prospect" name="prospectId" defaultValue="">
                    <option value="">None</option>
                    {data.prospects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.company ? ` (${p.company})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={`Quotation amount (${trackCurrency})`} htmlFor="la-amount">
                  <Input id="la-amount" name="amount" type="number" min={0} step="any" />
                </Field>
                <Field label="Date" htmlFor="la-date">
                  <Input id="la-date" name="occurredOn" type="date" max={data.today} defaultValue={data.today} />
                </Field>
                <fieldset className="flex flex-wrap items-end gap-3 text-sm">
                  <legend className="sr-only">Outcome (non-call activities)</legend>
                  {(["connected", "reachedDecisionMaker", "qualified", "meetingBooked"] as const).map((f) => (
                    <label key={f} className="flex items-center gap-1.5">
                      <input type="checkbox" name={f} className="size-4" />
                      {{ connected: "Response", reachedDecisionMaker: "Decision-maker", qualified: "Qualified", meetingBooked: "Meeting booked" }[f]}
                    </label>
                  ))}
                </fieldset>
                <Field label="Notes" htmlFor="la-notes" className="sm:col-span-3">
                  <Textarea id="la-notes" name="notes" rows={2} />
                </Field>
              </div>
            </ActionForm>
          </details>
        </CardContent>
      </Card>

      {/* Activity and results vs targets */}
      <Card>
        <CardHeader>
          <CardTitle>{SALES_PERIOD_LABELS[period]} activity and results</CardTitle>
          <CardDescription>
            {track ? "Bars show progress towards this period's targets." : "Choose a track to compare against its targets. Revenue is shown per currency."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.metrics.map((m) => (
              <li key={m.metric} className="flex flex-col gap-1.5 rounded-lg border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm">{SALES_METRIC_LABELS[m.metric]}</span>
                  <span className="text-lg font-semibold tabular-nums">
                    {m.metric === "revenue"
                      ? track
                        ? formatMeasure(m.actual ?? 0, "currency", track.currency)
                        : money(data.counts.revenue)
                      : m.actual}
                  </span>
                </div>
                {m.target !== null ? (
                  <>
                    <Progress
                      value={m.attainment ?? 0}
                      tone={LOWER_IS_BETTER.includes(m.metric) ? ((m.attainment ?? 0) < 100 ? "destructive" : "success") : (m.attainment ?? 0) >= 100 ? "success" : "default"}
                      label={`${SALES_METRIC_LABELS[m.metric]} vs target`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {LOWER_IS_BETTER.includes(m.metric) ? "limit" : "target"}{" "}
                      {m.metric === "revenue" && track ? formatMeasure(m.target, "currency", track.currency) : m.target}
                      {m.previous !== null ? ` · previous ${m.metric === "revenue" && track ? formatMeasure(m.previous, "currency", track.currency) : m.previous}` : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {m.previous !== null ? `previous ${m.metric === "revenue" && track ? formatMeasure(m.previous, "currency", track.currency) : m.previous} · ` : ""}no target
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Conversion rates</CardTitle>
            <CardDescription>Compared with the previous {SALES_PERIOD_LABELS[period].toLowerCase()}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {(Object.keys(RATE_LABELS) as (keyof typeof RATE_LABELS)[]).map((k) => (
                <div key={k} className="rounded-lg bg-muted p-3" title={RATE_LABELS[k].formula}>
                  <dt className="text-xs text-muted-foreground">{RATE_LABELS[k].label}</dt>
                  <dd className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold tabular-nums">{data.rates[k] === null ? "–" : `${data.rates[k]}%`}</span>
                    <Delta current={data.rates[k]} previous={data.previousRates[k]} />
                  </dd>
                  <dd className="text-[11px] text-muted-foreground">{RATE_LABELS[k].formula}</dd>
                </div>
              ))}
              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs text-muted-foreground">Average deal value</dt>
                <dd className="text-lg font-semibold">{money(data.rates.averageDealValue)}</dd>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs text-muted-foreground">Revenue per prospect</dt>
                <dd className="text-lg font-semibold">{money(data.rates.revenuePerProspect)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trend</CardTitle>
            <CardDescription>Rates over the last 8 {SALES_PERIOD_LABELS[period].toLowerCase()}s, which show whether you&apos;re getting better, not just busier.</CardDescription>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={data.trend} />
            <p className="mt-2 text-xs text-muted-foreground">
              Cold calls: {data.trend.map((t) => t.coldCalls).join(" · ")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open deals</CardTitle>
            <CardDescription>Pipeline: {money(data.openPipeline)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.openDeals.length === 0 ? <p className="text-sm text-muted-foreground">No open deals.</p> : null}
            {data.openDeals.map(({ deal, prospectName, prospectCompany }) => (
              <div key={deal.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{deal.title}</span>
                  <Badge variant="outline">{DEAL_STAGE_LABELS[deal.stage as DealStage]}</Badge>
                  {deal.amount ? <span className="text-sm text-muted-foreground">{formatMeasure(deal.amount, "currency", deal.currency)}</span> : null}
                </div>
                {prospectName ? (
                  <p className="text-xs text-muted-foreground">
                    {prospectName}
                    {prospectCompany ? ` · ${prospectCompany}` : ""}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {OPEN_DEAL_STAGES.filter((s) => s !== deal.stage).map((s) => (
                    <form key={s} action={moveDealAction.bind(null, deal.id, s)}>
                      <SubmitButton variant="outline" size="sm" className="h-8 text-xs">
                        → {DEAL_STAGE_LABELS[s]}
                      </SubmitButton>
                    </form>
                  ))}
                </div>
                <details className="rounded-md border p-2">
                  <summary className="cursor-pointer text-xs font-medium">Close deal</summary>
                  <ActionForm action={closeDealAction.bind(null, deal.id)} submitLabel="Close" submitVariant="outline" className="mt-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Outcome" htmlFor={`co-${deal.id}`}>
                        <Select id={`co-${deal.id}`} name="outcome" defaultValue="won">
                          <option value="won">Won</option>
                          <option value="lost">Lost</option>
                        </Select>
                      </Field>
                      <Field label={`Amount (${deal.currency})`} htmlFor={`ca-${deal.id}`}>
                        <Input id={`ca-${deal.id}`} name="amount" type="number" step="any" min={0} defaultValue={deal.amount ?? ""} />
                      </Field>
                      <Field label="Closed on" htmlFor={`cd-${deal.id}`}>
                        <Input id={`cd-${deal.id}`} name="closedOn" type="date" max={data.today} defaultValue={data.today} />
                      </Field>
                      <Field label="Lost reason" htmlFor={`cr-${deal.id}`}>
                        <Input id={`cr-${deal.id}`} name="lostReason" maxLength={1000} />
                      </Field>
                    </div>
                  </ActionForm>
                </details>
              </div>
            ))}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Add deal</summary>
              <ActionForm action={createDealAction.bind(null, logTrack)} submitLabel="Add deal" submitVariant="outline" className="mt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Deal" htmlFor="nd-title" className="sm:col-span-2">
                    <Input id="nd-title" name="title" required maxLength={200} />
                  </Field>
                  <Field label="Prospect" htmlFor="nd-prospect">
                    <Select id="nd-prospect" name="prospectId" defaultValue="">
                      <option value="">None</option>
                      {data.prospects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={`Value (${trackCurrency})`} htmlFor="nd-amount">
                    <Input id="nd-amount" name="amount" type="number" step="any" min={0} />
                  </Field>
                  <Field label="Stage" htmlFor="nd-stage">
                    <Select id="nd-stage" name="stage" defaultValue="qualified">
                      {OPEN_DEAL_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {DEAL_STAGE_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Expected close" htmlFor="nd-close">
                    <Input id="nd-close" name="expectedCloseOn" type="date" />
                  </Field>
                </div>
              </ActionForm>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prospects</CardTitle>
            <CardDescription>
              {data.followUpsDue.length ? `${data.followUpsDue.length} follow-up${data.followUpsDue.length === 1 ? "" : "s"} due` : "No follow-ups due."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col divide-y rounded-lg border">
              {data.prospects.slice(0, 15).map((p) => {
                const closed = p.status === "won" || p.status === "lost" || p.status === "disqualified";
                const due = !closed && p.nextFollowUpOn !== null && p.nextFollowUpOn <= data.today;
                return (
                  <li key={p.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {p.name}
                        {p.company ? <span className="font-normal text-muted-foreground"> · {p.company}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {PROSPECT_STATUS_LABELS[p.status as ProspectStatus]}
                        {p.nextFollowUpOn ? <span className={due ? "text-warning" : undefined}> · follow up {p.nextFollowUpOn}</span> : null}
                      </p>
                    </div>
                    <ActionForm action={setFollowUpAction.bind(null, p.id)} submitLabel="Set" submitVariant="outline" inline resetOnSuccess={false} submitClassName="h-8">
                      <Input name="nextFollowUpOn" type="date" defaultValue={p.nextFollowUpOn ?? ""} aria-label={`Next follow-up for ${p.name}`} className="h-8 w-40" />
                    </ActionForm>
                  </li>
                );
              })}
              {data.prospects.length === 0 ? <li className="p-3 text-sm text-muted-foreground">No prospects yet.</li> : null}
            </ul>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Add prospect</summary>
              <ActionForm action={createProspectAction.bind(null, logTrack)} submitLabel="Add prospect" submitVariant="outline" className="mt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" htmlFor="np-name">
                    <Input id="np-name" name="name" required maxLength={200} />
                  </Field>
                  <Field label="Company" htmlFor="np-company">
                    <Input id="np-company" name="company" maxLength={200} />
                  </Field>
                  <Field label="Role" htmlFor="np-role">
                    <Input id="np-role" name="role" maxLength={200} />
                  </Field>
                  <Field label="Source" htmlFor="np-source">
                    <Input id="np-source" name="source" maxLength={200} placeholder="e.g. LinkedIn, referral" />
                  </Field>
                  <Field label="Next follow-up" htmlFor="np-follow">
                    <Input id="np-follow" name="nextFollowUpOn" type="date" />
                  </Field>
                </div>
              </ActionForm>
            </details>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {data.recent.map(({ activity: a, prospectName }) => (
                <li key={a.id} className="flex items-center gap-2 py-2">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{a.occurredOn}</span>
                  <span className="min-w-0 flex-1">
                    {ACTIVITY_KIND_LABELS[a.kind as ActivityKind]}
                    {a.kind === "cold_call"
                      ? `: ${a.meetingBooked ? "meeting booked" : a.qualified ? "qualified" : a.reachedDecisionMaker ? "decision-maker" : a.connected ? "connected" : "no answer"}`
                      : a.connected
                        ? ": responded"
                        : ""}
                    {a.amount !== null && a.currency ? ` · ${formatMeasure(a.amount, "currency", a.currency)}` : ""}
                    {prospectName ? <span className="text-muted-foreground"> · {prospectName}</span> : null}
                  </span>
                  <form action={deleteActivityAction.bind(null, a.id)}>
                    <SubmitButton variant="ghost" size="icon" className="size-8" aria-label="Delete activity">
                      <Trash2 className="size-4" aria-hidden />
                    </SubmitButton>
                  </form>
                </li>
              ))}
              {data.recent.length === 0 ? <li className="py-2 text-muted-foreground">Nothing logged yet.</li> : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Targets and tracks</CardTitle>
            <CardDescription>
              {track
                ? `${track.name}: ${SALES_PERIOD_LABELS[period].toLowerCase()} targets. Changes apply from this ${SALES_PERIOD_LABELS[period].toLowerCase()} on; past periods keep the targets they had.`
                : "Pick a track above to set its targets."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {track ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.metrics.map((m) => (
                  <li key={m.metric}>
                    <ActionForm
                      action={setTargetAction.bind(null, track.id, period, m.metric)}
                      submitLabel="Set"
                      submitVariant="outline"
                      inline
                      resetOnSuccess={false}
                      submitClassName="h-8"
                    >
                      <label className="min-w-0 flex-1 truncate text-xs" htmlFor={`tg-${m.metric}`}>
                        {SALES_METRIC_LABELS[m.metric]}
                      </label>
                      <Input id={`tg-${m.metric}`} name="target" type="number" min={0} step="any" defaultValue={m.target ?? ""} className="h-8 w-24" />
                    </ActionForm>
                  </li>
                ))}
              </ul>
            ) : null}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Add sales track</summary>
              <ActionForm action={createTrackAction} submitLabel="Add track" submitVariant="outline" className="mt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" htmlFor="nt-name" hint="e.g. Employer – Acme, My SaaS, Workshops">
                    <Input id="nt-name" name="name" required maxLength={120} />
                  </Field>
                  <Field label="Currency" htmlFor="nt-cur">
                    <Input id="nt-cur" name="currency" required maxLength={3} className="uppercase" />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isDefault" className="size-4" /> Default track for quick logging
                </label>
              </ActionForm>
            </details>
          </CardContent>
        </Card>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/sales/journal" className={buttonVariants({ variant: "link", size: "sm" })}>
          Open the sales learning journal →
        </Link>
      </p>
    </div>
  );
}
