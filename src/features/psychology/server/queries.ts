import "server-only";
import { withUser } from "@/db/client";
import { getWorkspace } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import { getConcept, getStats, listConcepts, reviewQueue } from "./service";

export async function loadLab(filter: { category?: string; evidence?: string; understanding?: string; q?: string }) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, today: ws.today, stats: await getStats(tx), concepts: await listConcepts(tx, filter) };
  });
}

export async function loadReview() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => ({ queue: await reviewQueue(tx) }));
}

export async function loadConcept(id: string) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    return { today: ws.today, ...(await getConcept(tx, id)) };
  });
}
