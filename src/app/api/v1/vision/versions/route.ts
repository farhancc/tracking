import { listVisionVersions, requireWorkspace } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/vision/versions: every version, newest first. */
export const GET = apiRoute(async ({ tx }) => {
  const ws = await requireWorkspace(tx);
  return listVisionVersions(tx, ws.journey.id);
});
