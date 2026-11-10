import { describe, expect, it } from "vitest";
import { bucketsFor, childrenIndex, completionOn, judge, parseRangeKey, pctChange, prorate, resolveRange, toCsv, type GoalHistory } from "./analytics";

const journey = { startDate: "2026-01-05", endDate: "2031-01-04" };

describe("ranges", () => {
  it("resolves each filter and never runs past today", () => {
    const today = "2026-11-03"; // a Tuesday
    const r7 = resolveRange("7d", today, journey, 1);
    expect([r7.from, r7.to, r7.unit, r7.buckets.length]).toEqual(["2026-10-28", today, "day", 7]);
    expect(r7.previous).toEqual({ from: "2026-10-21", to: "2026-10-27" });
    const r30 = resolveRange("30d", today, journey, 1);
    expect(r30.from).toBe("2026-10-05");
    expect(r30.buckets[0]).toMatchObject({ start: "2026-10-05", end: "2026-10-11" });
    expect(r30.buckets.at(-1)).toMatchObject({ start: "2026-11-02", end: today });
    const r1y = resolveRange("1y", today, journey, 1);
    expect(r1y.buckets[0].start).toBe("2025-11-04"); // clipped, not the 1st
    expect(r1y.buckets).toHaveLength(13);
    const rj = resolveRange("journey", today, journey, 1);
    expect([rj.from, rj.to, rj.unit, rj.buckets.length]).toEqual(["2026-01-05", today, "month", 11]);
  });

  it("supports a calendar month for monthly reports", () => {
    expect(parseRangeKey("month:2026-10")).toBe("month:2026-10");
    expect(parseRangeKey("month:2026-13")).toBeNull();
    expect(parseRangeKey("2y")).toBeNull();
    const oct = resolveRange("month:2026-10", "2026-11-03", journey, 1);
    expect([oct.from, oct.to, oct.label]).toEqual(["2026-10-01", "2026-10-31", "October 2026"]);
    expect(oct.previous).toEqual({ from: "2026-08-31", to: "2026-09-30" });
    const nov = resolveRange("month:2026-11", "2026-11-03", journey, 1);
    expect(nov.to).toBe("2026-11-03");
  });

  it("buckets cover the range exactly, with no gaps or overlaps", () => {
    for (const unit of ["day", "week", "month"] as const) {
      const b = bucketsFor("2026-02-11", "2026-05-20", unit, 0);
      expect(b[0].start).toBe("2026-02-11");
      expect(b.at(-1)!.end).toBe("2026-05-20");
      for (let i = 1; i < b.length; i++) expect(new Date(b[i].start).getTime() - new Date(b[i - 1].end).getTime()).toBe(86_400_000);
    }
  });
});

describe("goal progress at a past date", () => {
  const g = (over: Partial<GoalHistory>): GoalHistory => ({ id: "x", parentId: null, isKeyResult: false, measurementMode: "latest", baselineValue: 0, targetValue: 100, archived: false, measurements: [], ...over });

  it("rebuilds latest, cumulative and key-result goals", () => {
    const latest = g({ id: "a", measurements: [{ measuredOn: "2026-02-01", value: 20 }, { measuredOn: "2026-03-01", value: 50 }] });
    const cumulative = g({ id: "b", measurementMode: "cumulative", baselineValue: 10, targetValue: 110, measurements: [{ measuredOn: "2026-02-01", value: 30 }, { measuredOn: "2026-03-01", value: 30 }] });
    const parent = g({ id: "p", measurementMode: "key_results" });
    const kr1 = { ...latest, id: "k1", parentId: "p", isKeyResult: true };
    const kr2 = { ...cumulative, id: "k2", parentId: "p", isKeyResult: true };
    const gone = g({ id: "k3", parentId: "p", isKeyResult: true, archived: true, measurements: [{ measuredOn: "2026-01-01", value: 100 }] });
    const all = [latest, cumulative, parent, kr1, kr2, gone];
    const byId = new Map(all.map((x) => [x.id, x]));
    const kids = childrenIndex(all);
    expect(completionOn(latest, "2026-01-15", byId, kids)).toBe(0);
    expect(completionOn(latest, "2026-02-15", byId, kids)).toBe(20);
    expect(completionOn(latest, "2026-03-01", byId, kids)).toBe(50);
    expect(completionOn(cumulative, "2026-02-15", byId, kids)).toBe(30);
    expect(completionOn(cumulative, "2026-03-15", byId, kids)).toBe(60);
    expect(completionOn(parent, "2026-03-15", byId, kids)).toBe(55); // archived KR left out
  });
});

describe("comparisons", () => {
  it("prorates targets and compares periods", () => {
    expect(prorate(10, "week", 3)).toBe(4.3);
    expect(prorate(30, "month", 365.25 / 12)).toBe(30);
    expect(pctChange(15, 10)).toBe(50);
    expect(pctChange(5, 0)).toBeNull();
  });

  it("judges activity against outcomes without overclaiming", () => {
    const base = { area: "Sales", activityLabel: "Calls", outcomeLabel: "Meetings" };
    expect(judge({ ...base, activity: 0, previousActivity: 0, outcome: 0, previousOutcome: 0 }).tone).toBe("none");
    expect(judge({ ...base, activity: 50, previousActivity: 40, outcome: 0, previousOutcome: 2 }).tone).toBe("warn");
    expect(judge({ ...base, activity: 50, previousActivity: 50, outcome: 10, previousOutcome: 5 }).tone).toBe("good");
    expect(judge({ ...base, activity: 100, previousActivity: 50, outcome: 5, previousOutcome: 5 }).text).toMatch(/more effort per result/);
    expect(judge({ ...base, activity: 50, previousActivity: 50, outcome: 5, previousOutcome: 5 }).tone).toBe("neutral");
    expect(judge({ ...base, activity: 50, previousActivity: 0, outcome: 5, previousOutcome: 0 }).text).toMatch(/no earlier period/);
  });

  it("writes safe CSV", () => {
    expect(toCsv([["a", 'say "hi"', "x,y", null, 3.5, -2, "=SUM(A1)", "-1 bad"]])).toBe(`a,"say ""hi""","x,y",,3.5,-2,'=SUM(A1),'-1 bad\r\n`);
  });
});
