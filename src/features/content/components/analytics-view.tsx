import { Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { JourneySetupForm } from "@/features/goals/components/journey-setup-form";
import { FORMAT_LABELS, PLATFORM_LABELS, PLATFORMS, type Platform } from "@/lib/domain/content";
import { ITEM_SORT_LABELS, ITEM_SORTS, MIN_SAMPLE, type GroupStats, type ItemSort } from "@/lib/domain/content-analytics";
import { cn } from "@/lib/utils";
import { deleteAudienceAction, recordAudienceAction } from "../server/actions";
import { loadAnalytics } from "../server/queries";
import { AudienceChart, EngagementTrendChart, LeadsTrendChart } from "./analytics-charts";
import { ContentNav } from "./content-nav";

type Params = Record<string, string | string[] | undefined>;
const WINDOW_LABELS = { "30": "30 days", "90": "90 days", "365": "12 months", all: "All time" } as const;
const n = (x: number | null | undefined) => (x == null ? "—" : new Intl.NumberFormat("en", { notation: x >= 100_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(x));
const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const money = (by: Record<string, number>) =>
  Object.entries(by)
    .map(([c, v]) => new Intl.NumberFormat("en", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(v))
    .join(" + ") || "—";

function GroupTable({ title, description, groups }: { title: string; description: string; groups: (GroupStats & { label: string })[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? <p className="text-sm text-muted-foreground">No published content in this period.</p> : null}
        <div className="overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0}>
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Group</th>
                <th className="py-1 text-right font-medium">Items</th>
                <th className="py-1 text-right font-medium">Audience</th>
                <th className="py-1 text-right font-medium">Engagement</th>
                <th className="py-1 text-right font-medium">Trust signals</th>
                <th className="py-1 text-right font-medium">Leads / item</th>
                <th className="py-1 text-right font-medium">Prospects</th>
                <th className="py-1 text-right font-medium">Won</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className={cn("border-t", g.smallSample && "text-muted-foreground")}>
                  <td className="py-1">
                    {g.label}
                    {g.smallSample ? <span className="ml-1 text-[11px]">(small sample)</span> : null}
                  </td>
                  <td className="py-1 text-right">
                    {g.items}
                    {g.measured < g.items ? <span className="text-[11px] text-muted-foreground"> ({g.measured} measured)</span> : null}
                  </td>
                  <td className="py-1 text-right">{n(g.audience)}</td>
                  <td className="py-1 text-right">{pct(g.engagementRate)}</td>
                  <td className="py-1 text-right">{pct(g.trustRate)}</td>
                  <td className="py-1 text-right">{g.leadsPerItem == null ? "—" : g.leadsPerItem.toFixed(1)}</td>
                  <td className="py-1 text-right">{g.prospects}</td>
                  <td className="py-1 text-right">{g.wonDeals ? `${g.wonDeals} · ${money(g.wonByCurrency)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export async function AnalyticsView({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const window = (["30", "90", "365", "all"] as const).find((w) => w === sp.window);
  const platform = PLATFORMS.find((p) => p === sp.platform);
  const sort = ITEM_SORTS.find((s) => s === sp.sort);
  const data = await loadAnalytics({ window, platform, sort });
  if (!data.ready) return <JourneySetupForm defaultStartDate={data.workspace.today} />;
  const href = (over: { window?: string; platform?: string | null; sort?: string }) => {
    const u = new URLSearchParams();
    const w = over.window ?? data.window;
    const p = over.platform === undefined ? data.platform : over.platform;
    const s = over.sort ?? data.sort;
    if (w !== "90") u.set("window", w);
    if (p) u.set("platform", p);
    if (s !== "business") u.set("sort", s);
    const q = u.toString();
    return q ? `/content/analytics?${q}` : "/content/analytics";
  };
  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent");
  const t = data.totals;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Content analytics</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Which topics build trust and bring leads and business, not just followers. Ranked by won deals and leads first, then depth of engagement, then reach.
        </p>
      </div>
      <ContentNav current="/content/analytics" />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(WINDOW_LABELS) as (keyof typeof WINDOW_LABELS)[]).map((w) => (
            <Link key={w} href={href({ window: w })} className={chip(data.window === w)}>
              {WINDOW_LABELS[w]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link href={href({ platform: null })} className={chip(!data.platform)}>
            All platforms
          </Link>
          {PLATFORMS.map((p) => (
            <Link key={p} href={href({ platform: p })} className={chip(data.platform === p)}>
              {PLATFORM_LABELS[p]}
            </Link>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Published", n(t?.items ?? 0), `${data.measuredCount} with metrics`],
          ["Audience reached", n(t?.audience ?? 0), "reach, else views or impressions"],
          ["Engagement rate", pct(t?.engagementRate), "likes, comments, shares, saves"],
          ["Trust signals", pct(t?.trustRate), "saves + shares + comments per viewer"],
          ["Leads reported", n(t?.reportedLeads ?? 0), "from your notes and insights"],
          ["Prospects attributed", n(t?.prospects ?? 0), `${t?.openDeals ?? 0} open deals`],
          ["Deals won", t?.wonDeals ? `${t.wonDeals}` : "0", money(t?.wonByCurrency ?? {})],
          ["Followers gained", n(t?.followersGained ?? 0), "one signal among many"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-xl border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{value}</dd>
            <dd className="text-[11px] text-muted-foreground">{hint}</dd>
          </div>
        ))}
      </dl>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What the numbers say</CardTitle>
          <CardDescription>Comparisons need at least {MIN_SAMPLE} measured items per group. Trust signals are a proxy: they show people keeping, recommending and discussing content.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-4 text-sm">
            {data.insights.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {data.unmeasured.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {data.unmeasured.length} published item(s) have no metrics yet and aren&rsquo;t compared:{" "}
              {data.unmeasured.slice(0, 5).map((u, i) => (
                <span key={u.id}>
                  {i ? ", " : ""}
                  <Link href={`/content/${u.id}`} className="underline-offset-2 hover:underline">
                    {u.title}
                  </Link>
                </span>
              ))}
              {data.unmeasured.length > 5 ? "…" : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Best-performing content</CardTitle>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {ITEM_SORTS.map((s) => (
              <Link key={s} href={href({ sort: s })} className={chip(data.sort === (s as ItemSort))}>
                {ITEM_SORT_LABELS[s]}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0}>
            <table className="w-full min-w-[760px] text-sm tabular-nums">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Content</th>
                  <th className="py-1 text-right font-medium">Audience</th>
                  <th className="py-1 text-right font-medium">Engagement</th>
                  <th className="py-1 text-right font-medium">Trust</th>
                  <th className="py-1 text-right font-medium">Leads</th>
                  <th className="py-1 text-right font-medium">Prospects</th>
                  <th className="py-1 text-right font-medium">Won</th>
                  <th className="py-1 text-right font-medium">Followers</th>
                </tr>
              </thead>
              <tbody>
                {data.topItems.map(({ item, stats, pillar }) => (
                  <tr key={item.id} className="border-t">
                    <td className="max-w-72 py-1">
                      <Link href={`/content/${item.id}`} className="font-medium underline-offset-2 hover:underline">
                        {item.title}
                      </Link>
                      <span className="block text-[11px] text-muted-foreground">
                        {PLATFORM_LABELS[item.platform]} {FORMAT_LABELS[item.format]} · {pillar ?? "no pillar"} · {item.publishedOn}
                      </span>
                    </td>
                    <td className="py-1 text-right">{n(stats.audience)}</td>
                    <td className="py-1 text-right">{pct(stats.engagementRate)}</td>
                    <td className="py-1 text-right">{pct(stats.trustRate)}</td>
                    <td className="py-1 text-right">{n(stats.reportedLeads)}</td>
                    <td className="py-1 text-right">{item.prospects || "—"}</td>
                    <td className="py-1 text-right">{item.won.count ? money(item.won.byCurrency) : "—"}</td>
                    <td className="py-1 text-right">{n(stats.followersGained)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <GroupTable title="By content pillar" description="Which pillars build trust and bring business." groups={data.byPillar} />
      <GroupTable title="By format" description="Platform and format combinations." groups={data.byFormat} />
      <GroupTable title="By topic" description="Topics as you named them on each item (top 15)." groups={data.byTopic} />

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement trends</CardTitle>
            <CardDescription>By publishing month, as a share of the audience reached.</CardDescription>
          </CardHeader>
          <CardContent>
            <EngagementTrendChart data={data.trends} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead generation trends</CardTitle>
            <CardDescription>Leads you reported vs prospects linked to content in the sales tracker.</CardDescription>
          </CardHeader>
          <CardContent>
            <LeadsTrendChart data={data.trends} />
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Audience growth</CardTitle>
          <CardDescription>Follower counts you record per platform. Growth matters, but leads and trust matter more.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.audienceGrowth.length ? (
            <div className="flex flex-wrap gap-2">
              {data.audienceGrowth.map((g) => (
                <Badge key={g.platform} variant="outline">
                  {PLATFORM_LABELS[g.platform as Platform]}: {n(g.last.followers)} ({g.change >= 0 ? "+" : ""}
                  {n(g.change)}
                  {g.pct != null ? `, ${pct(g.pct)}` : ""} since {g.first.capturedOn})
                </Badge>
              ))}
            </div>
          ) : null}
          {data.audience.length ? <AudienceChart data={data.audience} /> : <p className="text-sm text-muted-foreground">No follower counts recorded yet.</p>}
          <ActionForm action={recordAudienceAction} submitLabel="Record followers" submitVariant="outline">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Platform" htmlFor="au-platform">
                <Select id="au-platform" name="platform" defaultValue={data.platform ?? "instagram"}>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Followers / subscribers" htmlFor="au-count">
                <Input id="au-count" name="followers" type="number" min="0" inputMode="numeric" required />
              </Field>
              <Field label="Date" htmlFor="au-date">
                <Input id="au-date" name="capturedOn" type="date" max={data.today} defaultValue={data.today} />
              </Field>
              <Field label="Note" htmlFor="au-note">
                <Input id="au-note" name="notes" maxLength={500} />
              </Field>
            </div>
          </ActionForm>
          {data.audience.length ? (
            <div className="overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0}>
              <table className="w-full min-w-[360px] text-sm tabular-nums">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Date</th>
                    <th className="py-1 font-medium">Platform</th>
                    <th className="py-1 text-right font-medium">Followers</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.audience].reverse().map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="py-1">{a.capturedOn}</td>
                      <td className="py-1">{PLATFORM_LABELS[a.platform]}</td>
                      <td className="py-1 text-right">{n(a.followers)}</td>
                      <td className="text-right">
                        <form action={deleteAudienceAction.bind(null, a.id)}>
                          <SubmitButton variant="ghost" size="icon" className="size-8" aria-label={`Delete ${PLATFORM_LABELS[a.platform]} count from ${a.capturedOn}`}>
                            <Trash2 className="size-4" aria-hidden />
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
