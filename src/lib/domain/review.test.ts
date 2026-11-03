import { describe, expect, it } from "vitest";
import { observations, recurringPatterns, suggestGoals, type PastReview, type ReviewAnswers, type WeekSignals } from "./review";

const fmt = (n: number, c: string) => `${c} ${n}`;
const answers = (over: Partial<ReviewAnswers> = {}): ReviewAnswers => ({
  missed: [],
  completedNotes: null,
  biggestAchievement: null,
  learned: null,
  revenue: null,
  interest: null,
  wastedTime: null,
  stopDoing: null,
  continueDoing: null,
  changeNextWeek: null,
  ...over,
});
const base: WeekSignals = {
  goals: [],
  deliverables: { planned: 0, delivered: 0, titles: [] },
  time: { actualMinutes: 0, deliverableMinutes: 0, routineMinutes: 0, estimateRatio: null, capacityMinutes: null },
  carried: { carriedIn: 0, chronic: [] },
  mits: { set: 0, done: 0, daysWithMits: 0 },
  habits: { rate: null, done: 0, expected: 0, weakest: null, previousRate: null },
  sales: { activities: 0, calls: 0, connected: 0, meetings: 0, newProspects: 0, prospectsFromContent: 0, dealsWon: 0, wonByCurrency: {}, practiceSessions: 0, practiceMinutes: 0, psychReviews: 0 },
  product: { revenueByCurrency: {}, interviews: 0, committed: 0, feedback: 0, featuresShipped: 0, releases: 0, stepsValidated: 0 },
  brand: { published: 0, titles: [], attributedProspects: 0 },
  wealth: { incomeByCurrency: {}, incomeBySource: {}, expenses: 0, currency: null },
  learning: { readingMinutes: 0, completed: [] },
  activePillars: [],
};
const goal = (id: string, over: Partial<WeekSignals["goals"][number]> = {}): WeekSignals["goals"][number] => ({
  id,
  title: `Goal ${id}`,
  pillarKey: "sales",
  area: "sales",
  met: false,
  completionPct: 40,
  parentId: "obj",
  parentActive: true,
  successMetric: "Meetings booked",
  unit: "count",
  targetValue: 10,
  baselineValue: 0,
  measurementMode: "cumulative",
  ...over,
});

describe("weekly review", () => {
  it("states what happened with the numbers, per pillar", () => {
    const obs = observations(
      {
        ...base,
        goals: [goal("a", { met: true }), goal("b"), goal("c")],
        time: { actualMinutes: 600, deliverableMinutes: 120, routineMinutes: 480, estimateRatio: 1.6, capacityMinutes: null },
        carried: { carriedIn: 3, chronic: [{ title: "Update CRM", carryCount: 4 }] },
        sales: { ...base.sales, activities: 40, calls: 35, connected: 7, meetings: 2, newProspects: 5 },
        product: { ...base.product, featuresShipped: 3 },
        habits: { rate: 0.6, done: 30, expected: 50, weakest: { name: "Exercise", rate: 0.2 }, previousRate: 0.8 },
        activePillars: ["sales", "product", "brand"],
      },
      fmt,
    ).map((o) => o.text);
    expect(obs).toContain("Met 1 of 3 weekly goal(s) (33%).");
    expect(obs).toContain("10h logged on tasks; 80% of it on routine tasks that aren't deliverables.");
    expect(obs).toContain("Finished tasks took 1.6× their estimates.");
    expect(obs.join(" ")).toMatch(/"Update CRM" 4 times/);
    expect(obs.join(" ")).toMatch(/40 sales activities, 7 connected \(20%\), 2 meeting\(s\) booked, 5 new prospect\(s\), no deals won/);
    expect(obs).toContain("Shipped 3 features without a single customer conversation logged.");
    expect(obs.join(" ")).toMatch(/Habit consistency 60% \(down 20 points on last week\); weakest: Exercise at 20%/);
    expect(obs).toContainEqual(expect.stringMatching(/Active objectives here/));
    expect(observations(base, fmt)[0].text).toMatch(/No weekly goals were planned/);
  });

  it("finds recurring patterns only when they recur", () => {
    const r = (weekStart: string, over: Partial<PastReview>): PastReview => ({ weekStart, score: 60, answers: answers(), missedAreas: [], estimateRatio: null, pillarsWithoutGoals: [], ...over });
    const underest = answers({ missed: [{ goalId: "x", reason: "underestimated", note: null }], stopDoing: "Checking email before 10am" });
    const reviews = [
      r("2026-10-26", { answers: underest, score: 40, missedAreas: ["sales"], estimateRatio: 1.5, pillarsWithoutGoals: ["brand"] }),
      r("2026-10-19", { answers: underest, score: 55, missedAreas: ["sales"], estimateRatio: 1.4, pillarsWithoutGoals: ["brand"] }),
      r("2026-10-12", { answers: answers({ missed: [{ goalId: "y", reason: "underestimated", note: null }], stopDoing: "checking email before 10am!" }), score: 70, missedAreas: ["sales", "product"], estimateRatio: 1.35, pillarsWithoutGoals: ["brand"] }),
      r("2026-10-05", { score: 72 }),
    ];
    const p = recurringPatterns(reviews, { brand: "Personal branding" });
    expect(p).toContain('"Took longer than estimated" was a reason for missed goals in 3 of the last 4 weeks.');
    expect(p).toContain("A sales goal was missed in 3 of the last 4 weeks.");
    expect(p.join(" ")).toMatch(/overran their estimates by 30% or more in 3 of the last 4 weeks/);
    expect(p).toContain("Personal branding had no weekly goal in 3 of the last 4 weeks.");
    expect(p.join(" ")).toMatch(/"Checking email before 10am" under "stop doing" in 3 reviews/);
    expect(p.join(" ")).toMatch(/fallen three weeks running \(70 → 55 → 40\)/);
    expect(recurringPatterns([reviews[0]], {})).toEqual([]);
  });

  it("suggests retries, smaller targets and pillar gaps for approval", () => {
    const s = suggestGoals(
      { ...base, goals: [goal("a"), goal("b"), goal("c", { met: true }), goal("d", { parentActive: false })] },
      answers({ missed: [{ goalId: "a", reason: "too_ambitious", note: null }, { goalId: "b", reason: "priorities_changed", note: null }] }),
      [
        { pillarKey: "sales", pillarName: "Sales mastery", objectiveId: "obj", objectiveTitle: "Close 3 deals", area: "sales" },
        { pillarKey: "brand", pillarName: "Personal branding", objectiveId: "obj2", objectiveTitle: "Grow LinkedIn to 5k", area: "content" },
      ],
    );
    expect(s.map((x) => [x.kind, x.title, x.targetValue])).toEqual([
      ["smaller", "Goal a", 5],
      ["pillar_gap", 'Move "Grow LinkedIn to 5k" forward', 1],
    ]);
  });
});
