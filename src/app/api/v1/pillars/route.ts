import { getWorkspace } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/pillars */
export const GET = apiRoute(async ({ tx }) => (await getWorkspace(tx)).pillars);
