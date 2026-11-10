import { afterAll, describe, expect, it } from "vitest";
import { getAnalytics } from "../../src/features/analytics/server/service";
import { exportCsv, exportPdf } from "../../src/features/analytics/server/export";
import { goalCreateSchema, measurementCreateSchema } from "../../src/features/goals/schemas";
import { addMeasurement, createGoal, createJourney } from "../../src/features/goals/server/service";
import { activityCreateSchema } from "../../src/features/sales/schemas";
import { ensureDefaultTrack, logActivity, setTarget } from "../../src/features/sales/server/service";
import { addDays, todayIn } from "../../src/lib/domain/dates";
import { RANGE_KEYS } from "../../src/lib/domain/analytics";
import { connect } from "./helpers";

const h = connect();
afterAll(() => h.close());
const today = todayIn("UTC");

async function ownerWithHistory() {
  const userId = await h.newUser();
  const ws = await h.as(userId, (tx) => createJourney(tx, { name: "J", startDate: "2026-01-05", timezone: "UTC", baseCurrency: "USD", weekStartsOn: 1, displayName: null }));
  const pillar = (key: string) => ws.pillars.find((p) => p.key === key)!.id;
  const five = (title: string, mode: "latest" | "cumulative", targetValue: number) =>
    h.as(userId, (tx) =>
      createGoal(tx, goalCreateSchema.parse({ title, pillarId: pillar("sales"), level: "five_year", category: "business_ownership", startDate: "2026-01-05", targetDate: "2031-01-04", successMetric: "x", targetValue, measurementMode: mode })),
    );
  const a = await five("Revenue", "latest", 100);
  const b = await five("Clients", "cumulative", 50);
  const m = (goalId: string, measuredOn: string, value: number) => h.as(userId, (tx) => addMeasurement(tx, goalId, measurementCreateSchema.parse({ measuredOn, value })));
  await m(a.id, "2026-03-01", 10);
  await m(a.id, addDays(today, -20), 30);
  await m(b.id, "2026-04-01", 5);
  await m(b.id, addDays(today, -3), 5);
  return { userId, a, b };
}

describe("analytics", () => {
  it("rebuilds goal progress that matches the stored values and reports planned vs actual", async () => {
    const o = await ownerWithHistory();
    const r = await h.as(o.userId, (tx) => getAnalytics(tx, "90d"));
    const five = r.sections.find((s) => s.id === "five_year")!;
    // Today: Revenue 30/100 = 30 %, Clients (5+5)/50 = 20 % → mean 25 %. The rebuilt line ends at the same value.
    expect(five.kpis[0].actual).toBe(25);
    expect(five.chart!.rows.at(-1)!.actual).toBe(25);
    // 21 days ago Revenue was still 10 % and Clients 10 % → 10 %.
    const r30 = await h.as(o.userId, (tx) => getAnalytics(tx, "30d"));
    expect(r30.sections[0].chart!.rows[0].actual).toBe(10);
    expect(five.chart!.rows.at(-1)!.planned).toBe(five.kpis[0].planned);
    expect(five.table!.rows.map((x) => x[0])).toEqual(["Revenue", "Clients"]);
  });

  it("counts sales activity against prorated targets, by period", async () => {
    const o = await ownerWithHistory();
    const track = await h.as(o.userId, (tx) => ensureDefaultTrack(tx));
    await h.as(o.userId, (tx) => setTarget(tx, { trackId: track.id, metric: "prospecting_attempts", period: "week", targetValue: 14, effectiveFrom: "2026-01-05" }));
    const act = (o2: Record<string, unknown>) => activityCreateSchema.parse({ trackId: track.id, ...o2 });
    for (const day of [0, 1, 2]) await h.as(o.userId, (tx) => logActivity(tx, act({ kind: "cold_call", outcome: "connected", occurredOn: addDays(today, -day) })));
    await h.as(o.userId, (tx) => logActivity(tx, act({ kind: "cold_call", outcome: "meeting_booked", occurredOn: addDays(today, -40) })));

    const r = await h.as(o.userId, (tx) => getAnalytics(tx, "7d"));
    const s = r.sections.find((x) => x.id === "sales")!;
    expect(s.kpis[0]).toMatchObject({ label: "Prospecting attempts", actual: 3, planned: 14 }); // 7 days of a 14-a-week target
    expect(s.chart!.rows).toHaveLength(7);
    expect(s.chart!.rows.at(-1)).toMatchObject({ activity: 1, activityPlanned: 2 });
    expect(s.kpis[1]).toMatchObject({ label: "Cold calls", actual: 3, planned: null });
    expect(s.kpis[2]).toMatchObject({ label: "Meetings booked", actual: 0, planned: null });
    // The meeting 40 days ago is outside 7d but inside 90d.
    const r90 = await h.as(o.userId, (tx) => getAnalytics(tx, "90d"));
    expect(r90.sections.find((x) => x.id === "sales")!.kpis[2].actual).toBe(1);

    // Activity vs outcome: this week's calls with no meeting are flagged; previous 7 days had nothing.
    const pair = r.outcomes.pairs.find((p) => p.activityLabel.startsWith("Prospecting"))!;
    expect(pair).toMatchObject({ activity: 3, outcome: 0, tone: "warn" });
  });

  it("works for every range, a monthly report, an empty account, and keeps users apart", async () => {
    const o = await ownerWithHistory();
    for (const key of [...RANGE_KEYS, `month:${today.slice(0, 7)}` as const]) {
      const r = await h.as(o.userId, (tx) => getAnalytics(tx, key));
      expect(r.sections).toHaveLength(11);
      expect(r.range.buckets.length).toBeGreaterThan(0);
    }
    const empty = await h.newUser();
    await h.as(empty, (tx) => createJourney(tx, { name: "J", startDate: "2026-01-05", timezone: "UTC", baseCurrency: "USD", weekStartsOn: 1, displayName: null }));
    const r = await h.as(empty, (tx) => getAnalytics(tx, "30d"));
    expect(r.sections.every((s) => !s.hasData || s.id === "habits")).toBe(true);
    expect(r.sections[0].table).toBeNull(); // other user's goals are invisible
    expect(r.outcomes.pairs.every((p) => p.tone === "none")).toBe(true);

    const report = await h.as(o.userId, (tx) => getAnalytics(tx, "30d"));
    const csv = exportCsv(report);
    expect(csv.split("\r\n")[0]).toBe("section,kind,metric,period,planned,actual,unit");
    expect(csv).toContain(`Five-year progress,kpi,Average outcome progress,${report.range.from}..${report.range.to},`);
    const pdf = await exportPdf(report);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    expect(csv).toContain("Activity vs outcome");
  });
});
