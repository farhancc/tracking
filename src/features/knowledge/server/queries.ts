import "server-only";
import { withUser } from "@/db/client";
import { getWorkspace, listGoals } from "@/features/goals/server/service";
import { requireUser } from "@/lib/auth/current-user";
import type { ResourceQuery } from "../schemas";
import { getOverview, getResource, listResources } from "./service";

export async function loadKnowledge(q: ResourceQuery) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    const overview = await getOverview(tx);
    const filtered = q.kind || q.status || q.q || q.category ? await listResources(tx, q) : overview.resources;
    return { ready: true as const, ...overview, filtered };
  });
}

export async function loadResource(id: string) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const detail = await getResource(tx, id);
    const goals = await listGoals(tx, {});
    return { ...detail, goals: goals.map((g) => ({ id: g.id, title: g.title, level: g.level })) };
  });
}
