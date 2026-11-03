"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function LevelChart({ points, target }: { points: { date: string; level: number }[]; target: number }) {
  if (points.length === 0) return null;
  return (
    <figure>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            <ReferenceLine y={target} stroke="var(--success)" strokeDasharray="4 4" label={{ value: "Target", fontSize: 10, fill: "var(--success)" }} />
            <Line type="stepAfter" dataKey="level" name="Assessed level" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Assessed levels: {points.map((p) => `${p.date}: ${p.level}`).join(", ")}. Target {target}.</figcaption>
    </figure>
  );
}
