import { getOverview } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/knowledge: resources, reading goal and stats, practice in progress, knowledge applied */
export const GET = apiRoute(({ tx }) => getOverview(tx));
