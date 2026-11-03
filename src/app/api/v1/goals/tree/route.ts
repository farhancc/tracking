import { getGoalTree } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/goals/tree: the full hierarchy of the active journey, with health and blocker counts. */
export const GET = apiRoute(async ({ tx }) => {
  const { workspace, ...tree } = await getGoalTree(tx);
  return { today: workspace.today, journey: workspace.journey, ...tree };
});
