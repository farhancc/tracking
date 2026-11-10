import { afterAll, describe, expect, it } from "vitest";
import { contentPillars, habits, salesTracks } from "../../src/db/schema";
import { ensureContentSetup } from "../../src/features/content/server/service";
import { ensureDefaultHabits } from "../../src/features/habits/server/service";
import { ensureDefaultTrack } from "../../src/features/sales/server/service";
import { connect } from "./helpers";

const h = connect();
afterAll(() => h.close());

describe("first-visit defaults under concurrent requests", () => {
  it("creates one sales track, one set of habits and one set of content pillars", async () => {
    const o = await h.newOwner();
    // A page render plus prefetches can hit the same first-use path at the same moment.
    const tracks = await Promise.all([1, 2, 3].map(() => h.as(o.userId, (tx) => ensureDefaultTrack(tx))));
    expect(new Set(tracks.map((t) => t.id)).size).toBe(1);
    await Promise.all([1, 2, 3].map(() => h.as(o.userId, (tx) => ensureDefaultHabits(tx))));
    await Promise.all([1, 2, 3].map(() => h.as(o.userId, (tx) => ensureContentSetup(tx))));

    const count = async (t: typeof salesTracks | typeof habits | typeof contentPillars) => (await h.as(o.userId, (tx) => tx.select().from(t))).length;
    expect(await count(salesTracks)).toBe(1);
    expect(await count(habits)).toBe(9);
    expect(await count(contentPillars)).toBeGreaterThan(0);
    const names = (await h.as(o.userId, (tx) => tx.select({ n: contentPillars.name }).from(contentPillars))).map((r) => r.n);
    expect(new Set(names).size).toBe(names.length);
  });
});
