"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartPoint = { date: string; value: number };

/** Outcome history against the target. Receives already-shaped points from the server. */
export function MeasurementChart({ points, target, label }: { points: ChartPoint[]; target: number; label: string }) {
  if (points.length < 2) return null;
  return (
    <figure className="flex flex-col gap-2">
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={56} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            />
            <ReferenceLine y={target} stroke="var(--success)" strokeDasharray="4 4" label={{ value: "Target", fontSize: 11, fill: "var(--success)" }} />
            <Line type="monotone" dataKey="value" name={label} stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {label} over time: {points.map((p) => `${p.date}: ${p.value}`).join(", ")}. Target {target}.
      </figcaption>
    </figure>
  );
}
