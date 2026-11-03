"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function WeekTrendChart({ data }: { data: { weekStart: string; score: number | null }[] }) {
  const points = data.map((d) => ({ week: d.weekStart.slice(5), score: d.score ?? 0, hasScore: d.score !== null }));
  return (
    <figure>
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="score" name="Week score" fill="var(--primary)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Week scores: {data.map((d) => `${d.weekStart} ${d.score ?? "none"}`).join(", ")}</figcaption>
    </figure>
  );
}
