import "server-only";
import { desc } from "drizzle-orm";
import { withUser } from "@/db/client";
import { advisorQuestions } from "@/db/schema";
import { getWorkspace } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import { advisorConfigured } from "./advisor";
import { listProposals } from "./proposals";

export async function loadAdvisor() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return {
      ready: true as const,
      configured: advisorConfigured(),
      history: await tx.select().from(advisorQuestions).orderBy(desc(advisorQuestions.createdAt)).limit(15),
      proposals: await listProposals(tx),
    };
  });
}
