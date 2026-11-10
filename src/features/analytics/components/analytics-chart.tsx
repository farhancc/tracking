"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Chart } from "../server/service";

/** Planned is always neutral grey; actual series take the chart hues in fixed order. One axis, no animation. */
const ACTUAL = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

export function AnalyticsChart({ chart, title, format }: { chart: Chart; title: string; format: "count" | "percent" | "currency" | "minutes" | "level" }) {
  const actualKeys = chart.series.filter((s) => s.kind === "actual").map((s) => s.key);
  const color = (key: string, kind: "actual" | "planned") => (kind === "planned" ? "var(--muted-foreground)" : ACTUAL[actualKeys.indexOf(key) % ACTUAL.length]);
  const many = chart.rows.length > 8;
  const tick = (v: number) => (format === "percent" ? `${v}%` : Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v));
  return (
    <div className="h-56 w-full" role="img" aria-label={`${title} chart. The figures are in the table below.`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chart.rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={many ? "preserveStartEnd" : 0} minTickGap={8} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={tick} allowDecimals={format !== "count"} domain={format === "percent" ? [0, 100] : [0, "auto"]} width={44} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }}
            formatter={(v) => (typeof v === "number" ? (format === "percent" ? `${v}%` : v.toLocaleString()) : "–")}
            itemStyle={{ color: "var(--foreground)" }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          />
          {chart.series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} formatter={(value) => <span style={{ color: "var(--foreground)" }}>{value}</span>} /> : null}
          {chart.series.map((s) =>
            s.type === "bar" ? (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={color(s.key, s.kind)} fillOpacity={s.kind === "planned" ? 0.35 : 1} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={28} />
            ) : (
              <Line key={s.key} dataKey={s.key} name={s.label} stroke={color(s.key, s.kind)} strokeWidth={2} strokeDasharray={s.kind === "planned" ? "5 4" : undefined} dot={chart.rows.length <= 12 ? { r: 3 } : false} connectNulls isAnimationActive={false} type="linear" />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
