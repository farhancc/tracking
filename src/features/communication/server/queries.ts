import "server-only";
import { withUser } from "@/db/client";
import { getWorkspace } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import { getOverview, getSkill } from "./service";

export async function loadCommunication() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, ...(await getOverview(tx)) };
  });
}

export async function loadSkill(key: string) {
  const { userId } = await requireUser();
  return withUser(userId, (tx) => getSkill(tx, key));
}
