import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { formatMoney, formatPct, PRODUCT_STAGE_LABELS, type Recommendation } from "@/lib/domain/products";
import { createProductAction } from "../server/actions";
import { loadPortfolio } from "../server/queries";
import { ProductForm } from "./product-form";
import { RecommendationBadge } from "./recommendation-badge";

/** Where products appear: those needing a decision first. */
const ORDER: Recommendation[] = ["discontinue", "pause", "fix_retention", "invest", "validate", "maintain", "insufficient_data", "paused", "discontinued"];

const monthLabel = (m: string) => new Date(`${m}T00:00:00Z`).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" });

export async function PortfolioOverview() {
  const data = await loadPortfolio();
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const items = [...data.items].sort((a, b) => ORDER.indexOf(a.assessment.recommendation) - ORDER.indexOf(b.assessment.recommendation));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Product portfolio</h1>
        <p className="text-sm text-muted-foreground">
          Your software businesses, judged on recorded revenue, retention and customer evidence. Kept separate from personal learning goals.
        </p>
      </div>

      {data.totals.length ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.totals.flatMap((t) => [
            [`MRR (${t.currency})`, formatMoney(t.mrr, t.currency), `${t.products} live or in progress`],
            [`Active customers`, String(t.activeCustomers), t.currency],
            [`Profit, last 3 months`, formatMoney(t.recentProfit, t.currency), `${data.window.from.slice(0, 7)} – ${data.window.to.slice(0, 7)}`],
            [`Profit, lifetime`, formatMoney(t.lifetimeProfit, t.currency), "revenue − refunds − expenses"],
          ]).map(([label, value, hint], i) => (
            <div key={i} className="rounded-xl border bg-card p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              <dd className="text-[11px] text-muted-foreground">{hint}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {data.totals.length > 1 ? <p className="text-xs text-muted-foreground">Totals are shown per currency and never converted or added together.</p> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="products-h" className="flex flex-col gap-3 lg:col-span-2">
          <h2 id="products-h" className="text-lg font-semibold">
            Where to invest
          </h2>
          {items.length === 0 ? <p className="text-sm text-muted-foreground">No products yet. Add your first idea, even before writing code.</p> : null}
          <ul className="flex flex-col gap-3">
            {items.map(({ product: p, assessment: a, latestMetrics: m, recent3Months, lifetime, demand }) => (
              <li key={p.id}>
                <Link href={`/products/${p.id}`} className="flex flex-col gap-3 rounded-xl border bg-card p-4 hover:bg-accent">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant="outline">{PRODUCT_STAGE_LABELS[p.stage]}</Badge>
                    <span className="ml-auto">
                      <RecommendationBadge value={a.recommendation} />
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted-foreground">MRR{m ? ` · ${monthLabel(m.month)}` : ""}</dt>
                      <dd className="tabular-nums">{formatMoney(m?.mrr, p.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Customers · churn</dt>
                      <dd className="tabular-nums">
                        {m ? m.activeCustomers : "—"} · {formatPct(m?.churnRate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Profit, 3 months</dt>
                      <dd className={`tabular-nums ${recent3Months.profit < 0 ? "text-destructive" : ""}`}>{formatMoney(recent3Months.profit, p.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Profit, lifetime</dt>
                      <dd className={`tabular-nums ${lifetime.profit < 0 ? "text-destructive" : ""}`}>{formatMoney(lifetime.profit, p.currency)}</dd>
                    </div>
                  </dl>
                  {demand && !["launch", "growth", "optimization"].includes(p.stage) ? (
                    <p className="text-sm">
                      Demand evidence: <span className="font-medium">level {demand.level}/5, {demand.levelLabel}</span>
                      <span className="text-muted-foreground"> · {demand.interviews} interviews · {demand.committed + demand.presales.count} committed</span>
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {a.reasons.join(" ")} <span className="whitespace-nowrap">Confidence: {a.confidence}.</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Recommendations come from fixed, documented rules applied to what you recorded. They are prompts for a decision, not decisions:
            pausing or discontinuing is always your call.
          </p>
        </section>
        <aside>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a product</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductForm action={createProductAction} submitLabel="Add product" today={data.today} baseCurrency={data.baseCurrency} goals={[]} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
