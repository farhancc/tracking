import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assessmentCreateSchema, practiceCreateSchema } from "../../src/features/communication/schemas";
import {
  addAssessment,
  createRecording,
  deleteRecording,
  getOverview,
  getSkill,
  logPractice,
} from "../../src/features/communication/server/service";
import { createLocalStorage } from "../../src/lib/storage";
import { connect, rejectsWith } from "./helpers";

const h = connect();
let dir: string;
afterAll(async () => {
  await h.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("communication mastery", () => {
  it("seeds skills and daily exercises, and tracks today's exercises", async () => {
    const o = await h.newOwner();
    const ov = await h.as(o.userId, (tx) => getOverview(tx, "2026-10-20"));
    expect(ov.skills).toHaveLength(14);
    expect(ov.dailyExercises.map((e) => e.title)).toContain("Record a two-minute speech");
    expect(ov.summary).toMatchObject({ dailyDone: 0, dailyTotal: 5, notAssessed: 14 });
    const vocab = ov.dailyExercises.find((e) => e.key === "five_words")!;
    await h.as(o.userId, (tx) =>
      logPractice(tx, practiceCreateSchema.parse({ exerciseId: vocab.id, practicedOn: "2026-10-20", words: ["candid", "succinct", "rapport", "leverage", "concede"], durationMinutes: 10 })),
    );
    const after = await h.as(o.userId, (tx) => getOverview(tx, "2026-10-20"));
    expect(after.summary.dailyDone).toBe(1);
    expect(after.skills.find((s) => s.key === "vocabulary")!.status).toMatchObject({ currentLevel: null, sessionsLast30: 1, needsAssessment: true });
  });

  it("changes proficiency only through dated assessments with evidence", async () => {
    const o = await h.newOwner();
    await h.as(o.userId, (tx) => getOverview(tx, "2026-10-01"));
    let skill = await h.as(o.userId, (tx) => getSkill(tx, "negotiation"));
    for (let i = 1; i <= 12; i++) {
      await h.as(o.userId, (tx) => logPractice(tx, practiceCreateSchema.parse({ skillId: skill.skill.id, practicedOn: `2026-09-${String(i).padStart(2, "0")}`, durationMinutes: 20 })));
    }
    skill = await h.as(o.userId, (tx) => getSkill(tx, "negotiation"));
    expect(skill.status.currentLevel).toBeNull(); // 12 sessions, still not assessed

    await h.as(o.userId, (tx) => addAssessment(tx, assessmentCreateSchema.parse({ skillId: skill.skill.id, level: 4, method: "self", evidence: "Role-play: conceded price twice without trading", assessedOn: "2026-09-15" })));
    await h.as(o.userId, (tx) =>
      addAssessment(tx, assessmentCreateSchema.parse({ skillId: skill.skill.id, level: 6, method: "mentor", assessor: "Coach R.", evidence: "Held price, traded terms for volume", assessedOn: "2026-10-01" })),
    );
    skill = await h.as(o.userId, (tx) => getSkill(tx, "negotiation"));
    expect(skill.status).toMatchObject({ currentLevel: 6, firstLevel: 4, change: 2, lastAssessedOn: "2026-10-01" });
    expect(() => assessmentCreateSchema.parse({ skillId: skill.skill.id, level: 7, evidence: "" })).toThrow(/based on/);
    await rejectsWith(
      h.as(o.userId, (tx) => addAssessment(tx, assessmentCreateSchema.parse({ skillId: skill.skill.id, level: 9, evidence: "Future", assessedOn: "2999-01-01" }))),
      { detail: "occurred_in_future" },
    );
  });

  it("stores recordings under the owner's prefix and attaches them to practice", async () => {
    const o = await h.newOwner();
    dir = await mkdtemp(path.join(os.tmpdir(), "fyos-rec-"));
    const storage = createLocalStorage(dir);
    await h.as(o.userId, (tx) => getOverview(tx, "2026-10-20"));
    const speech = (await h.as(o.userId, (tx) => getOverview(tx, "2026-10-20"))).dailyExercises.find((e) => e.key === "two_minute_speech")!;
    const rec = await h.as(o.userId, (tx) =>
      createRecording(tx, storage, { userId: o.userId, bytes: new Uint8Array([26, 69, 223, 163, 1, 2]), mimeType: "audio/webm;codecs=opus", durationSeconds: 120 }),
    );
    expect(rec.storageKey.startsWith(`${o.userId}/recordings/`)).toBe(true);
    expect(rec.mimeType).toBe("audio/webm");
    expect(await storage.get(rec.storageKey)).not.toBeNull();
    await h.as(o.userId, (tx) => logPractice(tx, practiceCreateSchema.parse({ exerciseId: speech.id, practicedOn: "2026-10-20", recordingId: rec.id })));
    const detail = await h.as(o.userId, (tx) => getSkill(tx, "public_speaking"));
    expect(detail.recordings.map((r) => r.id)).toEqual([rec.id]);

    // Attached recordings can't be deleted out from under the practice log.
    await rejectsWith(h.as(o.userId, (tx) => deleteRecording(tx, storage, rec.id)), { code: "23503" });
    await expect(
      h.as(o.userId, (tx) => createRecording(tx, storage, { userId: o.userId, bytes: new Uint8Array([1]), mimeType: "video/mp4", durationSeconds: null })),
    ).rejects.toMatchObject({ code: "unsupported_audio" });
    // Another user can't see it.
    const other = await h.newOwner();
    await expect(h.as(other.userId, (tx) => getSkill(tx, "public_speaking").then((d) => d.recordings))).resolves.toEqual([]);
  });
});
