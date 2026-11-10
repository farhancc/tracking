import { AlertTriangle, CheckCircle2, Download, FileText, Minus, MinusCircle } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form-controls";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { parseRangeKey, RANGE_KEYS, RANGE_LABELS, type RangeKey } from "@/lib/domain/analytics";
import { cn } from "@/lib/utils";
import { loadAnalytics } from "../server/queries";
import type { AnalyticsReport, Kpi, Section } from "../server/service";
import { AnalyticsChart } from "./analytics-chart";

type Params = { range?: string | string[]; month?: string | string[] };

function rangeFrom(sp: Params): RangeKey {
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? parseRangeKey(`month:${sp.month}`) : null;
  return month ?? parseRangeKey(typeof sp.range === "string" ? sp.range : null) ?? "30d";
}

function formatValue(v: number | null, unit: Kpi["unit"], currency: string | null) {
  if (v === null) return "–";
  if (unit === "percent") return `${v}%`;
  if (unit === "currency" && currency) {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
    } catch {
      return `${currency} ${Math.round(v).toLocaleString("en")}`;
    }
  }
  if (unit === "minutes") return `${v.toLocaleString("en")} min`;
  return v.toLocaleString("en", { maximumFractionDigits: 1 });
}

function KpiRow({ k, currency }: { k: Kpi; currency: string | null }) {
  // A meter only where "planned" is a target on the same scale (not a cap, not a count of open items).
  const meter = k.planned !== null && k.planned > 0 && k.actual !== null && (k.unit === "count" || k.unit === "percent" || k.unit === "minutes");
  const pct = meter ? Math.min(100, Math.round((k.actual! / k.planned!) * 100)) : 0;
  return (
    <li className="min-w-0 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm text-muted-foreground">{k.label}</span>
        <span className="shrink-0 text-right tabular-nums">
          <span className="text-base font-semibold">{formatValue(k.actual, k.unit, currency)}</span>
          {k.planned !== null ? <span className="text-xs text-muted-foreground"> / {formatValue(k.planned, k.unit, currency)} planned</span> : null}
        </span>
      </div>
      {meter ? (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {k.note ? <p className="mt-0.5 text-xs text-muted-foreground">{k.note}</p> : null}
    </li>
  );
}

function SectionCard({ s }: { s: Section }) {
  return (
    <Card id={s.id} className="min-w-0 scroll-mt-20">
      <CardHeader className="pb-1">
        <CardTitle className="text-base">{s.title}</CardTitle>
        <CardDescription>{s.question}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!s.hasData ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">No data recorded in this period.</p> : null}
        <ul className="divide-y">
          {s.kpis.map((k) => (
            <KpiRow key={k.label} k={k} currency={s.currency} />
          ))}
        </ul>
        {s.chart && s.hasData ? <AnalyticsChart chart={s.chart} title={s.title} format={s.chart.unit} /> : null}
        {s.table && s.table.rows.length ? (
          <details className="rounded-md border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Table ({s.table.rows.length} rows)</summary>
            <div className="max-h-80 overflow-auto border-t">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr>
                    {s.table.columns.map((c, i) => (
                      <th key={c} scope="col" className={cn("px-2 py-1.5 font-medium text-muted-foreground", i ? "text-right" : "text-left")}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, ri) => (
                    <tr key={ri} className="border-t">
                      {r.map((c, i) =>
                        i === 0 ? (
                          <th key={i} scope="row" className="px-2 py-1.5 text-left font-normal">
                            {c ?? "–"}
                          </th>
                        ) : (
                          <td key={i} className="px-2 py-1.5 text-right tabular-nums">
                            {c === null ? "–" : typeof c === "number" ? c.toLocaleString("en", { maximumFractionDigits: 2 }) : c}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
        {s.notes.map((n) => (
          <p key={n} className="text-xs text-muted-foreground">
            {n}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

const TONE = {
  good: { icon: CheckCircle2, label: "Converting", cls: "text-success" },
  warn: { icon: AlertTriangle, label: "Check", cls: "text-amber-700 dark:text-amber-400" },
  neutral: { icon: Minus, label: "Steady", cls: "text-muted-foreground" },
  none: { icon: MinusCircle, label: "No data", cls: "text-muted-foreground" },
} as const;

function Outcomes({ o }: { o: AnalyticsReport["outcomes"] }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-base">Is activity turning into outcomes?</CardTitle>
        <CardDescription>
          This period compared with the {o.previous.from} to {o.previous.to} period.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul className="divide-y">
          {o.pairs.map((p) => {
            const t = TONE[p.tone];
            return (
              <li key={`${p.area}-${p.activityLabel}`} className="grid min-w-0 gap-1 py-2.5 sm:grid-cols-[8rem_1fr_1fr_1.4fr] sm:items-baseline sm:gap-3">
                <span className="text-sm font-medium">{p.area}</span>
                <span className="text-sm">
                  <span className="text-muted-foreground">{p.activityLabel}: </span>
                  <span className="tabular-nums">{p.activity.toLocaleString("en")}</span>
                  <span className="text-xs text-muted-foreground"> (before {p.previousActivity.toLocaleString("en")})</span>
                </span>
                <span className="text-sm">
                  <span className="text-muted-foreground">{p.outcomeLabel}: </span>
                  <span className="tabular-nums">{p.outcome.toLocaleString("en")}</span>
                  <span className="text-xs text-muted-foreground"> (before {p.previousOutcome.toLocaleString("en")})</span>
                </span>
                <span className={cn("flex items-start gap-1.5 text-sm", t.cls)}>
                  <t.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="sr-only">{t.label}: </span>
                    <span className="text-foreground">{p.text}</span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">{o.caveat}</p>
      </CardContent>
    </Card>
  );
}

export async function AnalyticsView({ searchParams }: { searchParams: Promise<Params> }) {
  const key = rangeFrom(await searchParams);
  const data = await loadAnalytics(key);
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const r = data.report;
  const exportHref = (format: "csv" | "pdf") => `/api/v1/analytics/export?range=${encodeURIComponent(key)}&format=${format}`;
  const monthValue = key.startsWith("month:") ? key.slice(6) : "";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {r.range.label}: {r.range.from} to {r.range.to}. Actuals are what you recorded; planned is what you set.
          </p>
        </div>
        <div className="flex gap-2">
          <a href={exportHref("pdf")} download className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent">
            <FileText className="size-4" aria-hidden /> PDF
          </a>
          <a href={exportHref("csv")} download className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent">
            <Download className="size-4" aria-hidden /> CSV
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <nav aria-label="Time range" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border p-1">
          {RANGE_KEYS.map((k) => (
            <Link
              key={k}
              href={`/analytics?range=${k}`}
              aria-current={key === k ? "page" : undefined}
              className={cn("inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm", key === k ? "bg-primary font-medium text-primary-foreground" : "hover:bg-accent")}
            >
              {RANGE_LABELS[k]}
            </Link>
          ))}
        </nav>
        <form action="/analytics" className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="report-month">Monthly report</Label>
            <Input id="report-month" type="month" name="month" defaultValue={monthValue} max={r.today.slice(0, 7)} min={r.journey.startDate.slice(0, 7)} required className="w-40" />
          </div>
          <button type="submit" className="inline-flex h-10 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent">
            Show
          </button>
        </form>
      </div>

      <nav aria-label="Sections" className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {r.sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={cn("underline-offset-2 hover:underline", !s.hasData && "text-muted-foreground")}>
            {s.title}
          </a>
        ))}
      </nav>

      <Outcomes o={r.outcomes} />

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {r.sections.map((s) => (
          <SectionCard key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}
