/**
 * Communication mastery: pure rules.
 *
 * Proficiency is ONLY what a dated assessment says. Completing exercises
 * builds the practice history, but never changes the level; a skill with
 * practice and no recent assessment is flagged "assessment due".
 */
import { addDays, addMonths, diffDays, type IsoDate } from "./dates";

export const COMMUNICATION_SKILLS: { key: string; name: string; description: string }[] = [
  { key: "spoken_english", name: "Spoken English", description: "Fluency and confidence speaking English in real conversations." },
  { key: "vocabulary", name: "Vocabulary", description: "Range and precision of the words you can use naturally." },
  { key: "grammar", name: "Grammar", description: "Accurate sentence structure in speech and writing." },
  { key: "pronunciation", name: "Pronunciation", description: "Clear, intelligible sounds, stress and intonation." },
  { key: "articulation", name: "Articulation", description: "Expressing ideas clearly, concisely and in a logical order." },
  { key: "active_listening", name: "Active listening", description: "Understanding, summarising and reflecting what others mean." },
  { key: "questioning", name: "Questioning techniques", description: "Open, probing and clarifying questions that uncover needs." },
  { key: "storytelling", name: "Storytelling", description: "Structuring stories that hold attention and make a point." },
  { key: "public_speaking", name: "Public speaking", description: "Speaking to a group with presence and control." },
  { key: "presentation", name: "Presentation", description: "Designing and delivering a clear, persuasive presentation." },
  { key: "emotional_intelligence", name: "Emotional intelligence", description: "Reading and managing emotions, yours and others'." },
  { key: "assertiveness", name: "Assertiveness", description: "Stating needs and boundaries respectfully and firmly." },
  { key: "negotiation", name: "Negotiation", description: "Creating and claiming value toward agreements." },
  { key: "conflict_resolution", name: "Conflict resolution", description: "Turning disagreement into understanding and next steps." },
];

/** The five daily exercises, each tied to the skill it trains. */
export const DAILY_EXERCISES: { key: string; title: string; instructions: string; skillKey: string; minutes: number; wantsRecording: boolean; wantsWords: boolean }[] = [
  {
    key: "two_minute_speech",
    title: "Record a two-minute speech",
    instructions: "Pick any topic. Speak for two minutes without stopping, then listen back and note one thing to improve.",
    skillKey: "public_speaking",
    minutes: 10,
    wantsRecording: true,
    wantsWords: false,
  },
  {
    key: "explain_simply",
    title: "Explain one complex topic simply",
    instructions: "Explain a concept from your work as if to a 12-year-old. Write or record the explanation.",
    skillKey: "articulation",
    minutes: 10,
    wantsRecording: false,
    wantsWords: false,
  },
  {
    key: "five_words",
    title: "Practise five new vocabulary words",
    instructions: "Learn five new words and use each in a sentence you would actually say.",
    skillKey: "vocabulary",
    minutes: 10,
    wantsRecording: false,
    wantsWords: true,
  },
  {
    key: "listen_summarize",
    title: "Listen to a conversation and summarise it",
    instructions: "Listen to a podcast segment or meeting for five minutes, then summarise the key points and the speaker's intent.",
    skillKey: "active_listening",
    minutes: 10,
    wantsRecording: false,
    wantsWords: false,
  },
  {
    key: "objection_practice",
    title: "Practise handling an objection",
    instructions: "Pick a real objection (price, timing, authority, need). Say your response out loud and refine it.",
    skillKey: "negotiation",
    minutes: 10,
    wantsRecording: true,
    wantsWords: false,
  },
];

export const ASSESSMENT_METHODS = ["self", "recording_review", "peer", "mentor", "test"] as const;
export type AssessmentMethod = (typeof ASSESSMENT_METHODS)[number];
export const ASSESSMENT_METHOD_LABELS: Record<AssessmentMethod, string> = {
  self: "Self-assessment",
  recording_review: "Recording review",
  peer: "Peer feedback",
  mentor: "Mentor / coach",
  test: "Formal test",
};

export const RESOURCE_KINDS = ["book", "course", "video", "podcast", "article", "app", "other"] as const;

/** Assessments older than this are due again. */
export const ASSESSMENT_INTERVAL_DAYS = 30;

export type AssessmentFact = { assessedOn: IsoDate; level: number; method: AssessmentMethod };
export type SessionFact = { practicedOn: IsoDate; durationMinutes: number | null };

export type SkillStatus = {
  currentLevel: number | null;
  lastAssessedOn: IsoDate | null;
  firstLevel: number | null;
  change: number | null;
  gap: number | null;
  assessmentDue: boolean;
  sessionsLast30: number;
  minutesLast30: number;
  sessionsSinceAssessment: number;
  /** Practice piling up without a fresh assessment. */
  needsAssessment: boolean;
};

export function skillStatus(input: { targetLevel: number; assessments: AssessmentFact[]; sessions: SessionFact[]; today: IsoDate }): SkillStatus {
  const sorted = [...input.assessments].sort((a, b) => a.assessedOn.localeCompare(b.assessedOn));
  const last = sorted.at(-1) ?? null;
  const first = sorted[0] ?? null;
  const recent = input.sessions.filter((s) => diffDays(s.practicedOn, input.today) < 30 && s.practicedOn <= input.today);
  const sinceAssessment = last ? input.sessions.filter((s) => s.practicedOn > last.assessedOn).length : input.sessions.length;
  const assessmentDue = !last || diffDays(last.assessedOn, input.today) >= ASSESSMENT_INTERVAL_DAYS;
  return {
    currentLevel: last?.level ?? null,
    lastAssessedOn: last?.assessedOn ?? null,
    firstLevel: first?.level ?? null,
    change: last && first && sorted.length > 1 ? last.level - first.level : null,
    gap: last ? input.targetLevel - last.level : null,
    assessmentDue,
    sessionsLast30: recent.length,
    minutesLast30: recent.reduce((s, x) => s + (x.durationMinutes ?? 0), 0),
    sessionsSinceAssessment: sinceAssessment,
    needsAssessment: assessmentDue && sinceAssessment > 0,
  };
}

/** First day of the month containing `date`, and the month's end. */
export function monthOf(date: IsoDate) {
  const start = `${date.slice(0, 7)}-01`;
  return { start, end: addDays(addMonths(start, 1), -1) };
}

export const LEVEL_DESCRIPTORS: Record<number, string> = {
  1: "Beginner: struggles even in simple situations",
  2: "Beginner",
  3: "Developing: manages familiar situations with effort",
  4: "Developing",
  5: "Competent: reliable in everyday situations",
  6: "Competent",
  7: "Proficient: effective under pressure",
  8: "Proficient",
  9: "Expert: others learn from you",
  10: "Expert",
};
