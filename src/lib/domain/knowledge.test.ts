import { describe, expect, it } from "vitest";
import { goalProgress, readingStats } from "./knowledge";

describe("knowledge domain", () => {
  it("tracks daily reading without letting an unfinished today break the streak", () => {
    const sessions = [
      { readOn: "2026-11-01", minutes: 20 },
      { readOn: "2026-11-01", minutes: 15 },
      { readOn: "2026-11-02", minutes: 30 },
      { readOn: "2026-10-31", minutes: 10 },
      { readOn: "2026-11-03", minutes: 5 },
    ];
    const s = readingStats(sessions, 30, "2026-11-03");
    expect(s).toMatchObject({ todayMinutes: 5, target: 30, targetMet: false, streak: 2, weekMinutes: 80, daysRead30: 4 });
    expect(readingStats([...sessions, { readOn: "2026-11-03", minutes: 25 }], 30, "2026-11-03").streak).toBe(3);
    expect(readingStats(sessions, null, "2026-11-03")).toMatchObject({ streak: 0, targetMet: null });
  });

  it("compares yearly completions with an even pace", () => {
    expect(goalProgress(10, 24, "2026-07-02")).toMatchObject({ completed: 10, target: 24, expectedByToday: 12, status: "behind" });
    expect(goalProgress(13, 24, "2026-07-02")!.status).toBe("on_pace");
    expect(goalProgress(3, null, "2026-07-02")).toBeNull();
  });
});
