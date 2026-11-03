import { z } from "zod";
import { advisorConfigured, askAdvisor } from "@/features/advisor/server/advisor";
import { apiRouteNoTx } from "@/lib/api/route";
import { AppError } from "@/lib/errors";

/**
 * POST /api/v1/advisor/ask: { question } → structured answer with verified facts,
 * assumptions, recommendations, data gaps, and any proposals awaiting confirmation.
 * Runs outside a request-wide transaction: each data read is its own short, rolled-back transaction.
 */
export const POST = apiRouteNoTx(async ({ user, body }) => {
  if (!advisorConfigured()) throw new AppError(503, "advisor_not_configured", "The AI advisor needs Anthropic API credentials on the server (ANTHROPIC_API_KEY).");
  const { question } = await body(z.object({ question: z.string().trim().min(1).max(2000) }));
  return askAdvisor({ userId: user.userId, question });
});
