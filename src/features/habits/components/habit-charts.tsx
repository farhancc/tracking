"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Weekly consistency across all habits (one series, so no legend). */
export function ConsistencyTrendChart({ data }: { data: { weekStart: string; rate: number | null; done: number; expected: number }[] }) {
  const rows = data.map((d) => ({
    label: new Date(`${d.weekStart}T00:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" }),
    pct: d.rate == null ? null : Math.round(d.rate * 100),
    detail: `${d.done} of ${d.expected}`,
  }));
  return (
    <figure>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(v, _n, p) => [`${v}% (${(p.payload as { detail: string }).detail})`, "Consistency"]}
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }}
            />
            <Bar dataKey="pct" name="Consistency" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{rows.map((r) => `Week of ${r.label}: ${r.pct ?? "n/a"}%`).join("; ")}</figcaption>
    </figure>
  );
}
