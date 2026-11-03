"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type PlannedActualPoint = {
  label: string;
  planned: number;
  delivered: number;
  objectiveCompletion: number | null;
};

/** Deliverables planned vs delivered (bars) and objective outcome completion (line) per quarter. */
export function PlannedVsActualChart({ data }: { data: PlannedActualPoint[] }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={0} angle={-45} textAnchor="end" height={44} />
            <YAxis yAxisId="count" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} unit="%" />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="count" dataKey="planned" name="Deliverables planned" fill="var(--muted-foreground)" fillOpacity={0.35} />
            <Bar yAxisId="count" dataKey="delivered" name="Delivered" fill="var(--primary)" />
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="objectiveCompletion"
              name="Objective completion"
              stroke="var(--success)"
              strokeWidth={2}
              connectNulls
              dot={{ r: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {data
          .filter((d) => d.planned > 0 || d.objectiveCompletion !== null)
          .map((d) => `${d.label}: ${d.delivered} of ${d.planned} deliverables, objectives ${d.objectiveCompletion ?? "n/a"}%`)
          .join("; ") || "No planned deliverables or objectives yet."}
      </figcaption>
    </figure>
  );
}
