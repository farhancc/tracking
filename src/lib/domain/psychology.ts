/**
 * Sales psychology and human behaviour lab: pure rules.
 *
 * - Evidence levels keep research separate from popular claims.
 * - Spaced repetition (SM-2 variant) schedules reviews.
 * - "Understood deeply" must be earned: repeated successful recall AND at
 *   least one real-world application with a recorded result.
 */
import { addDays, type IsoDate } from "./dates";

export const PSYCH_CATEGORIES = [
  "consumer_psychology",
  "cognitive_biases",
  "persuasion",
  "influence",
  "decision_making",
  "negotiation_psychology",
  "emotional_intelligence",
  "trust_building",
  "social_dynamics",
  "behavioural_economics",
] as const;
export type PsychCategory = (typeof PSYCH_CATEGORIES)[number];
export const PSYCH_CATEGORY_LABELS: Record<PsychCategory, string> = {
  consumer_psychology: "Consumer psychology",
  cognitive_biases: "Cognitive biases",
  persuasion: "Persuasion",
  influence: "Influence",
  decision_making: "Decision-making",
  negotiation_psychology: "Negotiation psychology",
  emotional_intelligence: "Emotional intelligence",
  trust_building: "Trust building",
  social_dynamics: "Social dynamics",
  behavioural_economics: "Behavioural economics",
};

export const EVIDENCE_LEVELS = ["strong", "moderate", "limited", "practitioner", "speculative"] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];
export const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, { label: string; description: string; evidenceBased: boolean }> = {
  strong: { label: "Strong evidence", description: "Replicated findings or meta-analyses.", evidenceBased: true },
  moderate: { label: "Moderate evidence", description: "Peer-reviewed studies, not yet widely replicated.", evidenceBased: true },
  limited: { label: "Limited or contested", description: "Mixed results or failed replications.", evidenceBased: false },
  practitioner: { label: "Practitioner experience", description: "Experienced sellers report it; little formal research.", evidenceBased: false },
  speculative: { label: "Speculative / popular claim", description: "Popular or internet claim without good evidence. Treat it as a hypothesis to test.", evidenceBased: false },
};

export const SOURCE_TYPES = ["peer_reviewed", "academic_book", "popular_book", "article", "video", "podcast", "course", "observation"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  peer_reviewed: "Peer-reviewed paper",
  academic_book: "Book by a researcher",
  popular_book: "Popular book",
  article: "Article / blog",
  video: "Video",
  podcast: "Podcast",
  course: "Course",
  observation: "My own observation",
};

export const UNDERSTANDING_LEVELS = ["new", "learning", "understood", "deep", "needs_study"] as const;
export type Understanding = (typeof UNDERSTANDING_LEVELS)[number];
export const UNDERSTANDING_LABELS: Record<Understanding, string> = {
  new: "New",
  learning: "Learning",
  understood: "Understood",
  deep: "Understood deeply",
  needs_study: "Needs further study",
};

export const REVIEW_RATINGS = ["again", "hard", "good", "easy"] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];
export const REVIEW_RATING_LABELS: Record<ReviewRating, string> = {
  again: "Again: couldn't recall",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

export const APPLICATION_OUTCOMES = ["worked", "mixed", "did_not_work", "inconclusive"] as const;
export type ApplicationOutcome = (typeof APPLICATION_OUTCOMES)[number];
export const APPLICATION_OUTCOME_LABELS: Record<ApplicationOutcome, string> = {
  worked: "Worked",
  mixed: "Mixed",
  did_not_work: "Didn't work",
  inconclusive: "Inconclusive",
};

export type SrState = { ease: number; intervalDays: number; repetitions: number; lapses: number };
export const NEW_SR_STATE: SrState = { ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };

/** SM-2 variant. Returns the new state and the next due date. */
export function scheduleReview(state: SrState, rating: ReviewRating, today: IsoDate): SrState & { dueOn: IsoDate } {
  let { ease, intervalDays, repetitions, lapses } = state;
  switch (rating) {
    case "again":
      repetitions = 0;
      lapses += 1;
      intervalDays = 1;
      ease = Math.max(1.3, ease - 0.2);
      break;
    case "hard":
      repetitions += 1;
      intervalDays = Math.max(1, Math.round(Math.max(intervalDays, 1) * 1.2));
      ease = Math.max(1.3, ease - 0.15);
      break;
    case "good":
      repetitions += 1;
      intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(Math.max(intervalDays, 1) * ease);
      break;
    case "easy":
      repetitions += 1;
      intervalDays = repetitions === 1 ? 4 : Math.round(Math.max(intervalDays, 1) * ease * 1.3);
      ease = ease + 0.15;
      break;
  }
  ease = Math.round(ease * 100) / 100;
  return { ease, intervalDays, repetitions, lapses, dueOn: addDays(today, intervalDays) };
}

export const DEEP_MIN_SUCCESSFUL_REVIEWS = 3;

export type DeepCheck = { allowed: true } | { allowed: false; reasons: string[] };

/** Whether a concept may be marked "understood deeply". Reading it is not enough. */
export function canMarkDeep(input: { successfulReviews: number; applicationsWithResult: number }): DeepCheck {
  const reasons: string[] = [];
  if (input.successfulReviews < DEEP_MIN_SUCCESSFUL_REVIEWS) {
    reasons.push(`Recall it successfully in at least ${DEEP_MIN_SUCCESSFUL_REVIEWS} reviews (${input.successfulReviews} so far).`);
  }
  if (input.applicationsWithResult < 1) {
    reasons.push("Apply it at least once in a real situation and record the result.");
  }
  return reasons.length ? { allowed: false, reasons } : { allowed: true };
}

/** Concepts needing more study: flagged by you, repeatedly forgotten, or last review failed. */
export function needsFurtherStudy(c: { understanding: Understanding; lapses: number; lastRating: ReviewRating | null }): boolean {
  return c.understanding === "needs_study" || c.lapses >= 2 || c.lastRating === "again";
}
