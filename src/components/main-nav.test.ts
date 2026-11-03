import { describe, expect, it } from "vitest";
import { activeHref, GROUPS, PRIMARY } from "./main-nav";

describe("main nav", () => {
  it("picks the most specific entry", () => {
    expect(activeHref("/goals/vision")).toBe("/goals/vision");
    expect(activeHref("/goals/3f1c0b9e-0000-4000-8000-000000000000")).toBe("/goals");
    expect(activeHref("/content/analytics")).toBe("/content");
    expect(activeHref("/today")).toBe("/today");
    expect(activeHref("/settings")).toBeNull();
  });
  it("lists every screen once", () => {
    const hrefs = [...PRIMARY, ...GROUPS.flatMap((g) => g.items)].map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.length).toBe(14);
  });
});
