/**
 * The strategy advisor: a tool-use loop over the user's own data that ends in
 * a structured answer separating facts from assumptions. Facts are checked
 * against what the tools actually returned before anything is shown.
 */
import Anthropic from "@anthropic-ai/sdk";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withUser } from "@/db/client";
import { advisorProposals, advisorQuestions } from "@/db/schema";
import { requireWorkspace } from "@/features/goals/server/service";
import { ANSWER_SCHEMA, unbackedNumbers, verifyFacts, type AdvisorAnswer } from "@/lib/domain/advisor";
import { AppError } from "@/lib/errors";
import { ALL_TOOLS, executeTool, type RunAs } from "./tools";

export const ADVISOR_MODEL = "claude-opus-5-5";
const MAX_TURNS = 12;

export const SYSTEM_PROMPT = `You are the strategy advisor inside FiveYearOS, a personal operating system for a five-year plan built on four pillars: sales mastery, product entrepreneurship, personal branding and financial independence. You act as a strategic advisor, execution analyst and accountability partner for one person, using only their own tracked data.

How to work:
- Read the data with the get_* tools before answering. Call several in parallel when the question spans areas.
- Never state a completed task, sales figure, financial result, metric or date that you did not read in a tool result in this conversation. If the data needed isn't there, say so in dataGaps instead of estimating it.
- facts: only what a tool returned. For each, name the tool in source and copy the exact value or phrase into evidence (for example "12000", "InvoiceBot", "at_risk"). Keep numbers exactly as returned.
- assumptions: every interpretation, judgement or estimate, stated plainly as such.
- recommendations: specific and tied to the data; mark basis "facts" only when it follows directly from the facts.
- Be direct and concrete. No generic motivation, no praise for its own sake, no filler.
- You cannot change anything. If a goal should change, or a task should be added or deleted, call the matching propose_* tool; the user confirms or rejects it. Mention any proposal in your answer as awaiting their confirmation. Propose only what the data supports.
- Health values: on_track, behind, at_risk, off_track, achieved, not_started. Rule-based product recommendations and review observations come from fixed rules; treat them as inputs, not conclusions.

Your final message must be the JSON object described by the output schema, with no other text.`;

/** The minimal client surface the advisor needs (lets tests script the model). */
export type AdvisorClient = { create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage> };

export function defaultClient(): AdvisorClient {
  const client = new Anthropic();
  return { create: (params) => client.beta.messages.create(params) };
}

/** Credentials are resolved by the SDK; these are the common ways to provide them. */
export function advisorConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE || process.env.FYOS_ADVISOR === "1");
}

const answerSchema = z.object({
  answer: z.string(),
  facts: z.array(z.object({ statement: z.string(), source: z.string(), evidence: z.string() })),
  assumptions: z.array(z.string()),
  recommendations: z.array(z.object({ action: z.string(), rationale: z.string(), basis: z.enum(["facts", "assumptions"]) })),
  dataGaps: z.array(z.string()),
});

/**
 * After a mid-output fallback, earlier thinking / tool_use blocks before the
 * last fallback marker must not be echoed back; text blocks and everything
 * after the marker are kept.
 */
export function echoable(content: Anthropic.Beta.BetaContentBlock[]): Anthropic.Beta.BetaContentBlockParam[] {
  const last = content.map((b) => b.type).lastIndexOf("fallback");
  const kept = last < 0 ? content : [...content.slice(0, last).filter((b) => b.type === "text"), ...content.slice(last + 1)];
  return kept as unknown as Anthropic.Beta.BetaContentBlockParam[];
}

export type AskResult = { questionId: string; answer: StoredAnswer | null; error: string | null };
export type StoredAnswer = Omit<AdvisorAnswer, "facts"> & {
  facts: ReturnType<typeof verifyFacts>;
  unbackedNumbers: string[];
  servedBy: string;
  proposals: string[];
};

export async function askAdvisor(input: { userId: string; question: string; client?: AdvisorClient; runAs?: RunAs }): Promise<AskResult> {
  const runAs = input.runAs ?? withUser;
  const question = input.question.trim().slice(0, 2000);
  if (!question) throw new AppError(422, "validation_failed", "Ask a question.");
  let client: AdvisorClient;
  try {
    client = input.client ?? defaultClient();
  } catch (e) {
    if (e instanceof Anthropic.AnthropicError) throw new AppError(503, "advisor_not_configured", "The AI advisor isn't configured: no valid Anthropic credentials on the server.");
    throw e;
  }
  const { today, questionId, history } = await runAs(input.userId, async (tx) => {
    const ws = await requireWorkspace(tx);
    const [q] = await tx.insert(advisorQuestions).values({ question, model: ADVISOR_MODEL }).returning({ id: advisorQuestions.id });
    // The last few answered questions as plain-text context (no tool data is replayed).
    const prior = await tx.select().from(advisorQuestions).orderBy(desc(advisorQuestions.createdAt)).limit(4);
    return { today: ws.today, questionId: q.id, history: prior.filter((p) => p.id !== q.id && p.answer).reverse() };
  });

  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const h of history) {
    messages.push({ role: "user", content: h.question });
    messages.push({ role: "assistant", content: String((h.answer as { answer?: string }).answer ?? "") });
  }
  messages.push({ role: "user", content: `Today is ${today}.\n\n${question}` });

  const toolLog: { name: string; input: unknown }[] = [];
  const outputs: { name: string; output: string }[] = [];
  const fail = async (message: string) => {
    await runAs(input.userId, (tx) => tx.update(advisorQuestions).set({ error: message, toolLog }).where(eq(advisorQuestions.id, questionId)));
    return { questionId, answer: null, error: message };
  };

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await client.create({
        model: ADVISOR_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high", format: { type: "json_schema", schema: ANSWER_SCHEMA as unknown as Record<string, unknown> } },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: ALL_TOOLS,
        messages,
      });
      if (res.stop_reason === "refusal") return fail("The model declined to answer this question.");
      if (res.stop_reason === "max_tokens") return fail("The answer was cut off. Try a narrower question.");
      messages.push({ role: "assistant", content: echoable(res.content) });
      if (res.stop_reason === "pause_turn") continue;

      if (res.stop_reason === "tool_use") {
        const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const call of calls) {
          toolLog.push({ name: call.name, input: call.input });
          const r = await executeTool(input.userId, call.name, call.input, questionId, runAs);
          outputs.push({ name: call.name, output: r.output });
          results.push({ type: "tool_result", tool_use_id: call.id, content: r.output, is_error: r.isError });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      const text = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      let parsed: AdvisorAnswer;
      try {
        parsed = answerSchema.parse(JSON.parse(text));
      } catch {
        return fail("The advisor's answer wasn't in the expected format.");
      }
      const facts = verifyFacts(parsed.facts, outputs);
      const proposals = await runAs(input.userId, (tx) => tx.select({ id: advisorProposals.id }).from(advisorProposals).where(eq(advisorProposals.questionId, questionId)));
      const stored: StoredAnswer = { ...parsed, facts, unbackedNumbers: unbackedNumbers(parsed.answer, facts), servedBy: res.model, proposals: proposals.map((p) => p.id) };
      await runAs(input.userId, (tx) => tx.update(advisorQuestions).set({ answer: stored, toolLog, model: res.model }).where(eq(advisorQuestions.id, questionId)));
      return { questionId, answer: stored, error: null };
    }
    return fail("The advisor took too many steps. Try a narrower question.");
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return fail("The AI advisor isn't configured: no valid Anthropic credentials on the server.");
    if (e instanceof Anthropic.RateLimitError) return fail("The AI service is rate-limited. Try again in a minute.");
    if (e instanceof Anthropic.APIError) return fail(`The AI service returned an error (${e.status ?? "network"}).`);
    // e.g. no credentials found when the client is created
    if (e instanceof Anthropic.AnthropicError) return fail("The AI advisor isn't configured: no valid Anthropic credentials on the server.");
    throw e;
  }
}
