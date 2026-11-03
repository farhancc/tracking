import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { advisorQuestions, financeSettings, goals } from "../../src/db/schema";
import { askAdvisor, type AdvisorClient } from "../../src/features/advisor/server/advisor";
import { confirmProposal, listProposals, rejectProposal } from "../../src/features/advisor/server/proposals";
import { executeTool } from "../../src/features/advisor/server/tools";
import { goalCreateSchema } from "../../src/features/goals/schemas";
import { createGoal } from "../../src/features/goals/server/service";
import { connect, rejectsWith } from "./helpers";

const h = connect();
afterAll(() => h.close());

/** A scripted stand-in for the Messages API: returns the given responses in order and records requests. */
function scripted(responses: Partial<Anthropic.Beta.BetaMessage>[]) {
  const requests: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const client: AdvisorClient = {
    async create(params) {
      requests.push(structuredClone(params));
      const r = responses.shift();
      if (!r) throw new Error("no scripted response left");
      return { id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", usage: {} as never, stop_sequence: null, stop_details: null, container: null, context_management: null, ...r } as Anthropic.Beta.BetaMessage;
    },
  };
  return { client, requests };
}
const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input, caller: { type: "direct" } }) as unknown as Anthropic.Beta.BetaContentBlock;
const text = (t: string) => ({ type: "text", text: t, citations: null }) as unknown as Anthropic.Beta.BetaContentBlock;

describe("strategy advisor", () => {
  it("reads only authorised data, separates verified facts from fabrications and only proposes changes", async () => {
    const o = await h.newOwner();
    const five = await h.as(o.userId, (tx) =>
      createGoal(tx, goalCreateSchema.parse({ title: "Build a profitable SaaS", pillarId: o.pillar("product"), level: "five_year", category: "business_ownership", startDate: "2027-01-01", targetDate: "2031-12-31", successMetric: "MRR", targetValue: 20000 })),
    );
    const other = await h.newOwner();
    await h.as(other.userId, (tx) =>
      createGoal(tx, goalCreateSchema.parse({ title: "SECRET other user goal", pillarId: other.pillar("sales"), level: "five_year", category: "business_ownership", startDate: "2027-01-01", targetDate: "2031-12-31", successMetric: "x", targetValue: 1 })),
    );

    const { client, requests } = scripted([
      {
        stop_reason: "tool_use",
        content: [text(""), toolUse("t1", "get_overview", {}), toolUse("t2", "get_finance", {}), toolUse("t3", "propose_goal_change", { goalId: five.id, title: null, targetValue: 15000, targetDate: null, priority: null, status: null, reason: "No revenue recorded yet" })],
      },
      {
        stop_reason: "end_turn",
        content: [
          text(
            JSON.stringify({
              answer: "You have 1 five-year goal and no recorded revenue, so progress can't be measured yet. Revenue is up 300%.",
              facts: [
                { statement: "One five-year goal exists", source: "get_overview", evidence: "Build a profitable SaaS" },
                { statement: "Its target is 20000 MRR", source: "get_overview", evidence: "20000" },
                { statement: "Annual income is 50000", source: "get_finance", evidence: "50000" },
                { statement: "Sales are strong", source: "get_sales", evidence: "12 deals" },
              ],
              assumptions: ["A lower first target would be easier to hit."],
              recommendations: [{ action: "Record product revenue monthly", rationale: "There is none to measure against", basis: "facts" }],
              dataGaps: ["No product revenue recorded."],
            }),
          ),
        ],
      },
    ]);

    const r = await askAdvisor({ userId: o.userId, question: "Am I progressing toward my five-year objectives?", client, runAs: h.as });
    expect(r.error).toBeNull();
    // Request shape: model, structured output, strict tools, cached system prompt, refusal fallback.
    expect(requests[0]).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"], output_config: { effort: "high", format: { type: "json_schema" } } });
    expect(requests[0].system).toEqual([expect.objectContaining({ cache_control: { type: "ephemeral" } })]);
    expect(requests[0].tools?.every((t) => (t as { strict?: boolean }).strict)).toBe(true);
    // The tool results went back in one user message, and never contained the other user's data.
    const results = requests[1].messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((x) => x.tool_use_id)).toEqual(["t1", "t2", "t3"]);
    expect(JSON.stringify(results)).toContain("Build a profitable SaaS");
    expect(JSON.stringify(results)).not.toContain("SECRET other user goal");

    expect(r.answer!.facts.map((f) => [f.statement, f.verified])).toEqual([
      ["One five-year goal exists", true],
      ["Its target is 20000 MRR", true],
      ["Annual income is 50000", false],
      ["Sales are strong", false],
    ]);
    expect(r.answer!.unbackedNumbers).toEqual(["300%"]);

    // Read tools leave nothing behind: get_finance would have created default settings, but it was rolled back.
    expect(await h.as(o.userId, (tx) => tx.select().from(financeSettings))).toEqual([]);

    // The goal is untouched until the proposal is confirmed.
    const [pending] = await h.as(o.userId, (tx) => listProposals(tx, "pending"));
    expect(pending).toMatchObject({ kind: "update_goal", status: "pending", summary: 'Change "Build a profitable SaaS": targetValue → 15000' });
    expect((await h.as(o.userId, (tx) => tx.select().from(goals).where(eq(goals.id, five.id))))[0].targetValue).toBe(20000);
    const confirmed = await h.as(o.userId, (tx) => confirmProposal(tx, pending.id));
    expect(confirmed).toMatchObject({ status: "confirmed", result: "Goal updated." });
    expect((await h.as(o.userId, (tx) => tx.select().from(goals).where(eq(goals.id, five.id))))[0].targetValue).toBe(15000);
    await expect(h.as(o.userId, (tx) => rejectProposal(tx, pending.id))).rejects.toMatchObject({ code: "proposal_decided" });
    await rejectsWith(h.as(o.userId, (tx) => tx.execute(`update advisor_proposals set status = 'rejected' where id = '${pending.id}'`)), { detail: "proposal_decided" });

    // Proposals can't reach another user's goal; another user can't see this user's questions.
    const cross = await executeTool(other.userId, "propose_archive_goal", { goalId: five.id, reason: "x" }, null, h.as);
    expect(cross).toMatchObject({ isError: true });
    expect(await h.as(other.userId, (tx) => tx.select().from(advisorQuestions))).toEqual([]);
  });

  it("records failures instead of inventing answers", async () => {
    const o = await h.newOwner();
    const refused = await askAdvisor({ userId: o.userId, question: "What should I prioritize this week?", client: scripted([{ stop_reason: "refusal", content: [] }]).client, runAs: h.as });
    expect(refused).toMatchObject({ answer: null, error: "The model declined to answer this question." });
    const garbled = await askAdvisor({ userId: o.userId, question: "Which skill needs improvement?", client: scripted([{ stop_reason: "end_turn", content: [text("not json")] }]).client, runAs: h.as });
    expect(garbled.error).toMatch(/expected format/);
    const rows = await h.as(o.userId, (tx) => tx.select().from(advisorQuestions));
    expect(rows.map((r) => [r.answer, Boolean(r.error)])).toEqual([
      [null, true],
      [null, true],
    ]);

    // A failed change is recorded as failed and changes nothing.
    const bad = await executeTool(o.userId, "propose_task", { title: "x", goalId: null, plannedWeek: "not-a-date", reason: "test" }, null, h.as);
    const { proposalId } = JSON.parse(bad.output);
    const failed = await h.as(o.userId, (tx) => confirmProposal(tx, proposalId));
    expect(failed.status).toBe("failed");
  });
});
