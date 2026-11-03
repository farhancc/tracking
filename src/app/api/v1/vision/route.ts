import { visionSaveSchema } from "@/features/goals/schemas";
import { getCurrentVision, requireWorkspace, saveVision } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/vision: the current vision version (null if none yet). */
export const GET = apiRoute(async ({ tx }) => {
  const ws = await requireWorkspace(tx);
  return getCurrentVision(tx, ws.journey.id);
});

/** PUT /api/v1/vision: saves a NEW version and makes it current. */
export const PUT = apiRoute(async ({ tx, body }) => saveVision(tx, await body(visionSaveSchema)), { status: 201 });
