import "server-only";
import { withUser } from "@/db/client";
import { requireUser } from "@/lib/auth/current-user";
import {
  getCurrentVision,
  getGoal,
  getGoalDetail,
  getGoalTree,
  getWorkspace,
  listGoalOptions,
  listGoals,
  listVisionVersions,
} from "./service";

/** Page loaders: authenticate, then read inside withUser() so RLS applies. */

export async function loadWorkspace() {
  const { userId } = await requireUser();
  return withUser(userId, (tx) => getWorkspace(tx));
}

export async function loadGoalTree() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    return { ready: true as const, ...(await getGoalTree(tx)) };
  });
}

export async function loadVisionPage() {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    const [vision, versions, fiveYearGoals] = [
      await getCurrentVision(tx, ws.journey.id),
      await listVisionVersions(tx, ws.journey.id),
      await listGoals(tx, { level: "five_year", includeArchived: false }),
    ];
    return { ready: true as const, workspace: ws, vision, versions, fiveYearGoals };
  });
}

export async function loadGoalFormData(goalId?: string) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const ws = await getWorkspace(tx);
    if (!ws.journey) return { ready: false as const, workspace: ws };
    const options = await listGoalOptions(tx);
    const goal = goalId ? await getGoal(tx, goalId) : null;
    return { ready: true as const, workspace: ws, options, goal };
  });
}

export async function loadGoalDetail(goalId: string) {
  const { userId } = await requireUser();
  return withUser(userId, async (tx) => {
    const detail = await getGoalDetail(tx, goalId);
    const options = await listGoalOptions(tx);
    return { ...detail, options };
  });
}
