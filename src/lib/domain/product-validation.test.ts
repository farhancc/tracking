import { describe, expect, it } from "vitest";
import { demandEvidence, needsValidationGate, type DemandInput } from "./product-validation";

const iv = (confirms: boolean | null, willingness: DemandInput["interviews"][number]["willingness"] = "unclear", price: number | null = null) => ({
  confirmsProblem: confirms,
  willingness,
  statedPrice: price,
});
const base: DemandInput = { stage: "validation", interviews: [], evidence: [], steps: [], metrics: [] };

describe("demandEvidence", () => {
  it("starts with no evidence and points at the first step", () => {
    const d = demandEvidence(base);
    expect(d).toMatchObject({ level: 0, levelLabel: "No evidence yet", nextStep: "problem_discovery", warnings: [] });
  });

  it("climbs the ladder only on customer behaviour, not verbal yeses", () => {
    const interviews = [...Array(7)].map(() => iv(true, "verbal_yes", 40)).concat([iv(false, "none"), iv(true, "would_consider", 60), iv(null)]);
    const d = demandEvidence({ ...base, interviews });
    expect(d.interviews).toBe(10);
    expect(d.confirmRate).toBeCloseTo(8 / 9);
    expect(d.level).toBe(2);
    expect(d.committed).toBe(0);
    expect(d.medianStatedPrice).toBe(40);
    expect(d.warnings.join(" ")).toMatch(/7 people said they'd pay but none committed/);

    const committed = demandEvidence({
      ...base,
      interviews: [...interviews.slice(0, 8), iv(true, "committed", 50), iv(true, "paid", 50)],
      evidence: [{ step: "presales", kind: "payment", value: 250 }],
    });
    expect(committed.level).toBe(3);
    expect(committed.presales).toEqual({ count: 1, amount: 250 });
  });

  it("needs each level in turn", () => {
    // Payments without interviews don't skip the problem levels.
    const d = demandEvidence({ ...base, evidence: [1, 2, 3].map(() => ({ step: "presales" as const, kind: "payment" as const, value: 100 })) });
    expect(d.criteria.find((c) => c.level === 3)!.met).toBe(true);
    expect(d.level).toBe(0);
  });

  it("measures landing conversion and retention from recorded data", () => {
    const d = demandEvidence({
      ...base,
      stage: "growth",
      interviews: [...Array(10)].map(() => iv(true, "paid")),
      evidence: [
        { step: "landing_page", kind: "visitors", value: 400 },
        { step: "landing_page", kind: "signups", value: 22 },
      ],
      metrics: [
        { month: "2026-08-01", mrr: 500, activeCustomers: 20, newCustomers: 2, churnedCustomers: 1 },
        { month: "2026-09-01", mrr: 550, activeCustomers: 22, newCustomers: 3, churnedCustomers: 1 },
        { month: "2026-10-01", mrr: 600, activeCustomers: 24, newCustomers: 3, churnedCustomers: 1 },
      ],
    });
    expect(d.landing.conversion).toBeCloseTo(0.055);
    expect(d.level).toBe(5);
  });

  it("warns when building before commitment and gates the MVP stage", () => {
    expect(demandEvidence({ ...base, stage: "mvp" }).warnings[0]).toMatch(/building before anyone has committed/);
    expect(needsValidationGate("validation", "mvp", 2)).toBe(true);
    expect(needsValidationGate("validation", "mvp", 3)).toBe(false);
    expect(needsValidationGate("mvp", "beta", 0)).toBe(false);
    expect(needsValidationGate("idea", "research", 0)).toBe(false);
  });
});
