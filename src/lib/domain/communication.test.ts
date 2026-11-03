import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalStorage } from "../storage";
import { COMMUNICATION_SKILLS, DAILY_EXERCISES, monthOf, skillStatus } from "./communication";

describe("communication catalogue", () => {
  it("covers the 14 skills and 5 daily exercises", () => {
    expect(COMMUNICATION_SKILLS).toHaveLength(14);
    expect(DAILY_EXERCISES.map((e) => e.key)).toEqual(["two_minute_speech", "explain_simply", "five_words", "listen_summarize", "objection_practice"]);
    const keys = new Set(COMMUNICATION_SKILLS.map((s) => s.key));
    expect(DAILY_EXERCISES.every((e) => keys.has(e.skillKey))).toBe(true);
    expect(monthOf("2026-02-14")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});

describe("skill status", () => {
  it("takes the level only from assessments, never from practice", () => {
    const practiceOnly = skillStatus({
      targetLevel: 8,
      assessments: [],
      sessions: Array.from({ length: 40 }, (_, i) => ({ practicedOn: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, durationMinutes: 10 })),
      today: "2026-10-30",
    });
    expect(practiceOnly).toMatchObject({ currentLevel: null, assessmentDue: true, needsAssessment: true, sessionsLast30: 40 });

    const assessed = skillStatus({
      targetLevel: 8,
      assessments: [
        { assessedOn: "2026-08-01", level: 4, method: "self" },
        { assessedOn: "2026-10-01", level: 6, method: "mentor" },
      ],
      sessions: [{ practicedOn: "2026-10-05", durationMinutes: 15 }],
      today: "2026-10-20",
    });
    expect(assessed).toMatchObject({ currentLevel: 6, firstLevel: 4, change: 2, gap: 2, assessmentDue: false, sessionsSinceAssessment: 1 });
    expect(skillStatus({ targetLevel: 8, assessments: [{ assessedOn: "2026-09-01", level: 6, method: "self" }], sessions: [], today: "2026-10-01" }).assessmentDue).toBe(true);
  });
});

describe("local storage driver", () => {
  it("stores, reads and deletes files, refusing unsafe keys", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fyos-storage-"));
    try {
      const s = createLocalStorage(dir);
      const key = "00000000-0000-4000-8000-000000000001/recordings/11111111-1111-4111-8111-111111111111.webm";
      await s.put(key, new Uint8Array([1, 2, 3]), "audio/webm");
      expect(Array.from((await s.get(key))!)).toEqual([1, 2, 3]);
      await s.delete(key);
      expect(await s.get(key)).toBeNull();
      await expect(s.put("../../etc/passwd", new Uint8Array([1]), "audio/webm")).rejects.toThrow(/Unsafe storage key/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
