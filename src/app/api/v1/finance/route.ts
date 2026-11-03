import { getDashboard } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/finance: actuals by month, position, FI target and projection (assumptions included), milestones, forecasts */
export const GET = apiRoute(({ tx }) => getDashboard(tx));
