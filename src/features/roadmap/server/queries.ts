import "server-only";
import { withUser } from "@/db/client";
import { getWorkspace } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import { getQuarter, getRoadmap } from "./service";

export async function loadRoadmap() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, roadmap: await getRoadmap(tx) };
  });
}

export async function loadQuarter(quarterNumber: number) {
  const { userId } = await requireUser();
  return withUser(userId, (tx) => getQuarter(tx, quarterNumber));
}
