import { describe, expect, it } from "vitest";
import { advanceProspectStatus, outcomeFlags, periodLabel, periodRange, salesMetrics, shiftPeriod, targetAttainment, type ActivityFact } from "./sales";

const call = (outcome: Parameters<typeof outcomeFlags>[0]): ActivityFact => ({ kind: "cold_call", ...outcomeFlags(outcome) });

describe("sales periods", () => {
  it("builds calendar periods and shifts them", () => {
    expect(periodRange("month", "2026-11-17", 1)).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(periodRange("quarter", "2026-11-17", 1)).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(periodRange("week", "2026-11-04", 1)).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    const q = periodRange("quarter", "2026-11-17", 1);
    expect(shiftPeriod("quarter", q, -1, 1)).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(periodLabel("quarter", q)).toBe("Q4 2026");
    expect(periodLabel("month", periodRange("month", "2026-11-17", 1))).toBe("November 2026");
  });
});

describe("sales metrics", () => {
  it("computes the funnel and its rates", () => {
    const activities: ActivityFact[] = [
      ...Array.from({ length: 4 }, () => call("no_answer")),
      call("connected"),
      call("connected"),
      call("decision_maker"),
      call("decision_maker"),
      call("qualified"),
      call("meeting_booked"),
      { kind: "prospecting", connected: false, reachedDecisionMaker: false, qualified: false, meetingBooked: false },
      { kind: "follow_up", connected: true, reachedDecisionMaker: false, qualified: false, meetingBooked: false },
      { kind: "follow_up", connected: false, reachedDecisionMaker: false, qualified: false, meetingBooked: false },
      { kind: "quotation", connected: false, reachedDecisionMaker: false, qualified: false, meetingBooked: false },
      { kind: "quotation", connected: false, reachedDecisionMaker: false, qualified: false, meetingBooked: false },
    ];
    const { counts, rates } = salesMetrics(activities, [
      { stage: "won", amount: 3000, currency: "USD" },
      { stage: "won", amount: 1000, currency: "USD" },
      { stage: "lost", amount: 2000, currency: "USD" },
    ]);
    expect(counts).toMatchObject({
      prospecting_attempts: 11,
      cold_calls: 10,
      calls_connected: 6,
      decision_makers_reached: 4,
      qualified_leads: 2,
      follow_ups: 2,
      meetings_booked: 1,
      quotations_sent: 2,
      deals_closed: 2,
      lost_deals: 1,
      revenue: { USD: 4000 },
    });
    expect(rates).toMatchObject({
      connectionRate: 60,
      qualificationRate: 50,
      meetingConversionRate: 50,
      proposalConversionRate: 100,
      closingRate: 66.7,
      followUpEffectiveness: 50,
      averageDealValue: { USD: 2000 },
      revenuePerProspect: { USD: 363.64 },
    });
  });

  it("keeps currencies separate and handles empty periods", () => {
    const { counts, rates } = salesMetrics([], [
      { stage: "won", amount: 100, currency: "USD" },
      { stage: "won", amount: 5000, currency: "INR" },
    ]);
    expect(counts.revenue).toEqual({ USD: 100, INR: 5000 });
    expect(rates.connectionRate).toBeNull();
    expect(rates.revenuePerProspect).toEqual({});
  });

  it("scores targets and only moves prospects forward", () => {
    expect(targetAttainment("cold_calls", 40, 50)).toBe(80);
    expect(targetAttainment("lost_deals", 3, 2)).toBe(67);
    expect(targetAttainment("lost_deals", 1, 2)).toBe(100);
    expect(targetAttainment("cold_calls", 40, null)).toBeNull();
    expect(advanceProspectStatus("qualified", "connected")).toBe("qualified");
    expect(advanceProspectStatus("contacted", "meeting")).toBe("meeting");
    expect(advanceProspectStatus("lost", "meeting")).toBe("lost");
  });
});
