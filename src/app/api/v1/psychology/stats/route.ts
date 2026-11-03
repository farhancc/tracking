import { getStats } from "@/features/psychology/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/psychology/stats: learned, reviewed, applied, understood deeply, needs study, evidence mix */
export const GET = apiRoute(({ tx }) => getStats(tx));
