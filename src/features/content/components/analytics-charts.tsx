"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { tick: { fontSize: 10, fill: "var(--muted-foreground)" }, tickLine: false, axisLine: false } as const;
const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" };
const monthLabel = (m: string) => new Date(`${m.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" });

export type TrendPoint = { month: string; engagementRate: number | null; trustRate: number | null; reportedLeads: number; prospects: number };

/** Engagement rate and trust-signal rate by publishing month (both % of audience). */
export function EngagementTrendChart({ data }: { data: TrendPoint[] }) {
  const rows = data.map((d) => ({
    label: monthLabel(d.month),
    engagement: d.engagementRate == null ? null : Math.round(d.engagementRate * 1000) / 10,
    trust: d.trustRate == null ? null : Math.round(d.trustRate * 1000) / 10,
  }));
  return (
    <figure>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" {...axis} />
            <YAxis unit="%" {...axis} />
            <Tooltip formatter={(v, n) => [`${v}%`, n]} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="engagement" name="Engagement rate" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }} connectNulls isAnimationActive={false} />
            <Line dataKey="trust" name="Trust signals (saves, shares, comments)" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-2)" }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{rows.map((r) => `${r.label}: engagement ${r.engagement ?? "n/a"}%, trust ${r.trust ?? "n/a"}%`).join("; ")}</figcaption>
    </figure>
  );
}

/** Leads reported in insights and prospects attributed in the sales tracker, by month. */
export function LeadsTrendChart({ data }: { data: TrendPoint[] }) {
  const rows = data.map((d) => ({ label: monthLabel(d.month), reported: d.reportedLeads, prospects: d.prospects }));
  return (
    <figure>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" {...axis} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="reported" name="Leads (reported)" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Bar dataKey="prospects" name="Prospects attributed" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{rows.map((r) => `${r.label}: ${r.reported} leads, ${r.prospects} prospects`).join("; ")}</figcaption>
    </figure>
  );
}

const PLATFORM_COLOR = { instagram: "var(--chart-1)", youtube: "var(--chart-2)", linkedin: "var(--chart-3)" } as const;
const PLATFORM_NAME = { instagram: "Instagram", youtube: "YouTube", linkedin: "LinkedIn" } as const;

/** Follower counts per platform over time. Colour follows the platform, never its rank. */
export function AudienceChart({ data }: { data: { platform: keyof typeof PLATFORM_COLOR; capturedOn: string; followers: number }[] }) {
  const dates = [...new Set(data.map((d) => d.capturedOn))].sort();
  const platforms = (Object.keys(PLATFORM_COLOR) as (keyof typeof PLATFORM_COLOR)[]).filter((p) => data.some((d) => d.platform === p));
  const rows = dates.map((date) => ({ date, ...Object.fromEntries(platforms.map((p) => [p, data.find((d) => d.platform === p && d.capturedOn === date)?.followers ?? null])) }));
  return (
    <figure>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={(v: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(v)} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => new Intl.NumberFormat("en").format(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {platforms.map((p) => (
              <Line key={p} dataKey={p} name={PLATFORM_NAME[p]} stroke={PLATFORM_COLOR[p]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: PLATFORM_COLOR[p] }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Follower counts by platform; the table below lists every snapshot.</figcaption>
    </figure>
  );
}
