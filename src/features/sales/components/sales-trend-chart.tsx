"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendPoint = {
  label: string;
  connectionRate: number | null;
  qualificationRate: number | null;
  meetingConversionRate: number | null;
  closingRate: number | null;
};

const SERIES = [
  { key: "connectionRate", name: "Connection", color: "var(--primary)" },
  { key: "qualificationRate", name: "Qualification", color: "#7c3aed" },
  { key: "meetingConversionRate", name: "Meeting conversion", color: "#db2777" },
  { key: "closingRate", name: "Closing", color: "var(--success)" },
] as const;

/** Conversion rates over the last 8 periods: performance, not volume. */
export function SalesTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <figure>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {SERIES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {data.map((d) => `${d.label}: connection ${d.connectionRate ?? "n/a"}%, closing ${d.closingRate ?? "n/a"}%`).join("; ")}
      </figcaption>
    </figure>
  );
}
