import "server-only";
import { withUser } from "@/db/client";
import { getWorkspace } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import type { RangeKey } from "@/lib/domain/analytics";
import { getAnalytics } from "./service";

export async function loadAnalytics(range: RangeKey) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, report: await getAnalytics(tx, range) };
  });
}
