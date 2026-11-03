/**
 * AI strategy advisor: the standing questions, the structured answer format
 * (facts kept apart from assumptions), and a check that every "fact" quotes
 * a value actually present in the data the advisor read.
 */

export const ADVISOR_QUESTIONS = [
  "Am I progressing toward my five-year objectives?",
  "What is my biggest bottleneck?",
  "Which activity produces the most value?",
  "Am I spreading myself too thin?",
  "Which product deserves attention?",
  "Which skill needs improvement?",
  "What should I prioritize this week?",
] as const;

export type AdvisorFact = { statement: string; source: string; evidence: string };
export type AdvisorAnswer = {
  answer: string;
  facts: AdvisorFact[];
  assumptions: string[];
  recommendations: { action: string; rationale: string; basis: "facts" | "assumptions" }[];
  dataGaps: string[];
};

/** JSON schema for the final response (structured outputs). */
export const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "facts", "assumptions", "recommendations", "dataGaps"],
  properties: {
    answer: { type: "string", description: "Direct answer in 2-5 sentences. Every number in it must also appear in facts." },
    facts: {
      type: "array",
      description: "Only things read from a tool result in this conversation.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "source", "evidence"],
        properties: {
          statement: { type: "string" },
          source: { type: "string", description: "Name of the tool whose result contains the evidence." },
          evidence: { type: "string", description: "The exact value or phrase copied from that tool result (e.g. a number, a title)." },
        },
      },
    },
    assumptions: { type: "array", items: { type: "string" }, description: "Interpretations, estimates and judgement calls not directly in the data." },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "rationale", "basis"],
        properties: {
          action: { type: "string" },
          rationale: { type: "string" },
          basis: { type: "string", enum: ["facts", "assumptions"] },
        },
      },
    },
    dataGaps: { type: "array", items: { type: "string" }, description: "What's missing or not tracked that would change the answer." },
  },
} as const;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s,'"“”‘’]/g, "")
    .replace(/\.0+(?=\D|$)/g, "");

export type VerifiedFact = AdvisorFact & { verified: boolean; reason: string | null };

/**
 * A fact is verified only when its evidence text appears in the output of the
 * tool it cites, and that tool was actually called. Everything else is shown
 * as unverified, never as fact.
 */
export function verifyFacts(facts: AdvisorFact[], toolOutputs: { name: string; output: string }[]): VerifiedFact[] {
  const byTool = new Map<string, string>();
  for (const t of toolOutputs) byTool.set(t.name, (byTool.get(t.name) ?? "") + norm(t.output));
  return facts.map((f) => {
    const out = byTool.get(f.source);
    if (out == null) return { ...f, verified: false, reason: `The advisor didn't read "${f.source}".` };
    const ev = norm(f.evidence);
    if (!ev) return { ...f, verified: false, reason: "No evidence quoted." };
    return out.includes(ev) ? { ...f, verified: true, reason: null } : { ...f, verified: false, reason: `"${f.evidence}" isn't in the data from ${f.source}.` };
  });
}

const NUMBER_WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve" };

/** Numbers in the headline answer that no verified fact backs up. */
export function unbackedNumbers(answer: string, facts: VerifiedFact[]): string[] {
  const backed = facts.filter((f) => f.verified).map((f) => `${f.statement} ${f.evidence}`);
  const backedNorm = backed.map(norm);
  const nums = answer.match(/\d[\d,.]*%?/g) ?? [];
  return [...new Set(nums)].filter((n) => {
    const k = norm(n).replace(/%$/, "");
    if (!k || /^20\d\d$/.test(k) || backedNorm.some((b) => b.includes(k))) return false;
    // "1 goal" is backed by a fact that says "One goal".
    const word = NUMBER_WORDS[Number(k)];
    return !(word && backed.some((b) => new RegExp(`\\b${word}\\b`, "i").test(b)));
  });
}
