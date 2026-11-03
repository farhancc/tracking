import { desc } from "drizzle-orm";
import { advisorQuestions } from "@/db/schema";
import { advisorConfigured } from "@/features/advisor/server/advisor";
import { listProposals } from "@/features/advisor/server/proposals";
import { apiRoute } from "@/lib/api/route";
import { ADVISOR_QUESTIONS } from "@/lib/domain/advisor";

/** GET /api/v1/advisor: whether the AI is configured, the standing questions, recent answers and proposals */
export const GET = apiRoute(async ({ tx }) => ({
  configured: advisorConfigured(),
  questions: ADVISOR_QUESTIONS,
  history: await tx.select().from(advisorQuestions).orderBy(desc(advisorQuestions.createdAt)).limit(20),
  proposals: await listProposals(tx),
}));
