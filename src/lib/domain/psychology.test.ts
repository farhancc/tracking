import { describe, expect, it } from "vitest";
import { NEW_SR_STATE, canMarkDeep, needsFurtherStudy, scheduleReview } from "./psychology";

describe("spaced repetition", () => {
  it("grows intervals on success and resets on failure", () => {
    const d = "2026-10-01";
    const r1 = scheduleReview(NEW_SR_STATE, "good", d);
    expect(r1).toMatchObject({ intervalDays: 1, repetitions: 1, dueOn: "2026-10-02" });
    const r2 = scheduleReview(r1, "good", "2026-10-02");
    expect(r2).toMatchObject({ intervalDays: 3, repetitions: 2, dueOn: "2026-10-05" });
    const r3 = scheduleReview(r2, "good", "2026-10-05");
    expect(r3).toMatchObject({ intervalDays: 8, repetitions: 3 }); // 3 × 2.5 → 8
    const lapse = scheduleReview(r3, "again", "2026-10-13");
    expect(lapse).toMatchObject({ intervalDays: 1, repetitions: 0, lapses: 1, ease: 2.3 });
    expect(scheduleReview(NEW_SR_STATE, "easy", d)).toMatchObject({ intervalDays: 4, ease: 2.65 });
    expect(scheduleReview({ ...NEW_SR_STATE, ease: 1.3 }, "again", d).ease).toBe(1.3); // floor
  });
});

describe("deep understanding", () => {
  it("must be earned with recall and real application", () => {
    expect(canMarkDeep({ successfulReviews: 10, applicationsWithResult: 0 })).toEqual({ allowed: false, reasons: [expect.stringContaining("Apply it")] });
    expect(canMarkDeep({ successfulReviews: 2, applicationsWithResult: 3 }).allowed).toBe(false);
    expect(canMarkDeep({ successfulReviews: 3, applicationsWithResult: 1 }).allowed).toBe(true);
    expect(needsFurtherStudy({ understanding: "understood", lapses: 2, lastRating: "good" })).toBe(true);
    expect(needsFurtherStudy({ understanding: "learning", lapses: 0, lastRating: "again" })).toBe(true);
    expect(needsFurtherStudy({ understanding: "learning", lapses: 1, lastRating: "hard" })).toBe(false);
  });
});
