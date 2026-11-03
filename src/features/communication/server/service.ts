/**
 * Communication mastery service. Current proficiency is read from the latest
 * assessment only; practice sessions never change it.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Tx } from "@/db/drizzle";
import { commAssessments, commExercises, commPracticeSessions, commRecordings, commResources, commSkills } from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import { COMMUNICATION_SKILLS, DAILY_EXERCISES, monthOf, skillStatus, type AssessmentMethod } from "@/lib/domain/communication";
import { AppError, notFound } from "@/lib/errors";
import { AUDIO_TYPES, MAX_AUDIO_BYTES, type Storage } from "@/lib/storage";
import type { AssessmentCreateInput, PracticeCreateInput } from "../schemas";

export type SkillRow = typeof commSkills.$inferSelect;
export type ExerciseRow = typeof commExercises.$inferSelect;
export type RecordingRow = typeof commRecordings.$inferSelect;

/** Seeds the 14 skills and the 5 daily exercises once (keeps any edits). */
export async function ensureCommunicationSetup(tx: Tx) {
  await tx
    .insert(commSkills)
    .values(COMMUNICATION_SKILLS.map((s, i) => ({ key: s.key, name: s.name, description: s.description, sortOrder: i })))
    .onConflictDoNothing({ target: [commSkills.userId, commSkills.key] });
  const skills = await tx.select({ id: commSkills.id, key: commSkills.key }).from(commSkills);
  const skillId = new Map(skills.map((s) => [s.key, s.id]));
  await tx
    .insert(commExercises)
    .values(
      DAILY_EXERCISES.map((e, i) => ({
        key: e.key,
        title: e.title,
        instructions: e.instructions,
        skillId: skillId.get(e.skillKey) ?? null,
        durationMinutes: e.minutes,
        isDaily: true,
        wantsRecording: e.wantsRecording,
        wantsWords: e.wantsWords,
        sortOrder: i,
      })),
    )
    .onConflictDoNothing({ target: [commExercises.userId, commExercises.key] });
}

async function loadFacts(tx: Tx, skillIds: string[]) {
  if (skillIds.length === 0) return { assessments: [], sessions: [] };
  const assessments = await tx
    .select({ skillId: commAssessments.skillId, assessedOn: commAssessments.assessedOn, level: commAssessments.level, method: commAssessments.method })
    .from(commAssessments)
    .where(inArray(commAssessments.skillId, skillIds));
  const sessions = await tx
    .select({ skillId: commPracticeSessions.skillId, practicedOn: commPracticeSessions.practicedOn, durationMinutes: commPracticeSessions.durationMinutes })
    .from(commPracticeSessions)
    .where(inArray(commPracticeSessions.skillId, skillIds));
  return { assessments, sessions };
}

export async function getOverview(tx: Tx, dayArg?: string) {
  const ws = await requireWorkspace(tx);
  await ensureCommunicationSetup(tx);
  const day = dayArg ?? ws.today;
  const skills = await tx.select().from(commSkills).where(isNull(commSkills.archivedAt)).orderBy(asc(commSkills.sortOrder), asc(commSkills.name));
  const { assessments, sessions } = await loadFacts(tx, skills.map((s) => s.id));
  const month = monthOf(day);

  const skillViews = skills.map((s) => {
    const status = skillStatus({
      targetLevel: s.targetLevel,
      assessments: assessments.filter((a) => a.skillId === s.id).map((a) => ({ ...a, method: a.method as AssessmentMethod })),
      sessions: sessions.filter((x) => x.skillId === s.id),
      today: day,
    });
    const assessedThisMonth = assessments.some((a) => a.skillId === s.id && a.assessedOn >= month.start && a.assessedOn <= month.end);
    return { ...s, status, assessedThisMonth };
  });

  const daily = await tx.select().from(commExercises).where(and(eq(commExercises.isDaily, true), isNull(commExercises.archivedAt))).orderBy(asc(commExercises.sortOrder));
  const todaySessions = await tx.select().from(commPracticeSessions).where(eq(commPracticeSessions.practicedOn, day));
  const skillName = new Map(skills.map((s) => [s.id, s.name]));

  return {
    day,
    month,
    skills: skillViews,
    dailyExercises: daily.map((e) => ({
      ...e,
      skillName: e.skillId ? (skillName.get(e.skillId) ?? null) : null,
      doneToday: todaySessions.some((x) => x.exerciseId === e.id),
    })),
    summary: {
      dailyDone: daily.filter((e) => todaySessions.some((x) => x.exerciseId === e.id)).length,
      dailyTotal: daily.length,
      assessedThisMonth: skillViews.filter((s) => s.assessedThisMonth).length,
      assessmentsDue: skillViews.filter((s) => s.status.assessmentDue).length,
      notAssessed: skillViews.filter((s) => s.status.currentLevel === null).length,
    },
  };
}
export type CommunicationOverview = Awaited<ReturnType<typeof getOverview>>;

async function findSkillByKey(tx: Tx, key: string) {
  const [s] = await tx.select().from(commSkills).where(eq(commSkills.key, key)).limit(1);
  if (!s) throw notFound("Skill");
  return s;
}

export async function getSkill(tx: Tx, key: string) {
  const ws = await requireWorkspace(tx);
  await ensureCommunicationSetup(tx);
  const skill = await findSkillByKey(tx, key);
  const assessments = await tx.select().from(commAssessments).where(eq(commAssessments.skillId, skill.id)).orderBy(desc(commAssessments.assessedOn), desc(commAssessments.createdAt));
  const sessions = await tx
    .select({ session: commPracticeSessions, exerciseTitle: commExercises.title })
    .from(commPracticeSessions)
    .leftJoin(commExercises, eq(commExercises.id, commPracticeSessions.exerciseId))
    .where(eq(commPracticeSessions.skillId, skill.id))
    .orderBy(desc(commPracticeSessions.practicedOn), desc(commPracticeSessions.createdAt))
    .limit(100);
  const exercises = await tx.select().from(commExercises).where(and(eq(commExercises.skillId, skill.id), isNull(commExercises.archivedAt))).orderBy(asc(commExercises.sortOrder));
  const resources = await tx.select().from(commResources).where(eq(commResources.skillId, skill.id)).orderBy(asc(commResources.createdAt));
  const status = skillStatus({
    targetLevel: skill.targetLevel,
    assessments: assessments.map((a) => ({ assessedOn: a.assessedOn, level: a.level, method: a.method as AssessmentMethod })),
    sessions: sessions.map((s) => ({ practicedOn: s.session.practicedOn, durationMinutes: s.session.durationMinutes })),
    today: ws.today,
  });
  const recordingIds = [...assessments.map((a) => a.recordingId), ...sessions.map((s) => s.session.recordingId)].filter((x): x is string => !!x);
  const recordings = recordingIds.length ? await tx.select().from(commRecordings).where(inArray(commRecordings.id, recordingIds)) : [];
  return { today: ws.today, skill, status, assessments, sessions, exercises, resources, recordings };
}
export type SkillDetail = Awaited<ReturnType<typeof getSkill>>;

export async function updateSkill(tx: Tx, id: string, patch: { targetLevel?: number; description?: string | null }) {
  const [row] = await tx.update(commSkills).set(patch).where(eq(commSkills.id, id)).returning();
  if (!row) throw notFound("Skill");
  return row;
}

export async function addExercise(tx: Tx, input: { skillId: string; title: string; instructions: string | null; durationMinutes: number | null; isDaily: boolean }) {
  const [row] = await tx.insert(commExercises).values(input).returning();
  return row;
}

export async function addResource(tx: Tx, input: { skillId: string; kind: (typeof commResources.$inferInsert)["kind"]; title: string; url: string | null; notes: string | null }) {
  const [row] = await tx.insert(commResources).values(input).returning();
  return row;
}

export async function deleteResource(tx: Tx, id: string) {
  const rows = await tx.delete(commResources).where(eq(commResources.id, id)).returning({ id: commResources.id });
  if (!rows.length) throw notFound("Resource");
}

/** Logs practice. It adds to the history and never changes the proficiency level. */
export async function logPractice(tx: Tx, input: PracticeCreateInput) {
  const ws = await requireWorkspace(tx);
  let skillId = input.skillId;
  if (input.exerciseId) {
    const [e] = await tx.select().from(commExercises).where(eq(commExercises.id, input.exerciseId)).limit(1);
    if (!e) throw notFound("Exercise");
    skillId = skillId ?? e.skillId;
  }
  const [row] = await tx
    .insert(commPracticeSessions)
    .values({ ...input, skillId, practicedOn: input.practicedOn ?? ws.today })
    .returning();
  return row;
}

export async function deletePractice(tx: Tx, id: string) {
  const rows = await tx.delete(commPracticeSessions).where(eq(commPracticeSessions.id, id)).returning({ id: commPracticeSessions.id });
  if (!rows.length) throw notFound("Practice session");
}

/** The only way the current level changes. */
export async function addAssessment(tx: Tx, input: AssessmentCreateInput) {
  const ws = await requireWorkspace(tx);
  const [row] = await tx.insert(commAssessments).values({ ...input, assessedOn: input.assessedOn ?? ws.today }).returning();
  return row;
}

export async function listPractice(tx: Tx, filter: { from?: string; to?: string }) {
  const where = [];
  if (filter.from) where.push(gte(commPracticeSessions.practicedOn, filter.from));
  if (filter.to) where.push(lte(commPracticeSessions.practicedOn, filter.to));
  return tx
    .select()
    .from(commPracticeSessions)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(commPracticeSessions.practicedOn))
    .limit(500);
}

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

export async function createRecording(
  tx: Tx,
  storage: Storage,
  input: { userId: string; bytes: Uint8Array; mimeType: string; durationSeconds: number | null },
): Promise<RecordingRow> {
  const base = input.mimeType.split(";")[0].trim().toLowerCase();
  const ext = AUDIO_TYPES[base];
  if (!ext) throw new AppError(415, "unsupported_audio", "Upload an audio file (webm, ogg, m4a, mp3, wav or aac).");
  if (input.bytes.byteLength === 0) throw new AppError(400, "empty_file", "The recording is empty.");
  if (input.bytes.byteLength > MAX_AUDIO_BYTES) throw new AppError(413, "file_too_large", "Recordings can be up to 4 MB (about 15 minutes of speech).");
  const key = `${input.userId}/recordings/${randomUUID()}.${ext}`;
  await storage.put(key, input.bytes, base);
  try {
    const [row] = await tx
      .insert(commRecordings)
      .values({ storageKey: key, mimeType: base, sizeBytes: input.bytes.byteLength, durationSeconds: input.durationSeconds })
      .returning();
    return row;
  } catch (e) {
    await storage.delete(key).catch(() => undefined);
    throw e;
  }
}

export async function findRecording(tx: Tx, id: string): Promise<RecordingRow> {
  const [r] = await tx.select().from(commRecordings).where(eq(commRecordings.id, id)).limit(1);
  if (!r) throw notFound("Recording");
  return r;
}

export async function deleteRecording(tx: Tx, storage: Storage, id: string) {
  const r = await findRecording(tx, id);
  await tx.delete(commRecordings).where(eq(commRecordings.id, id)); // FK restrict: fails if still attached
  await storage.delete(r.storageKey);
}
