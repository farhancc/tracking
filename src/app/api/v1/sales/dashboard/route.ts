import { dashboardQuerySchema } from "@/features/sales/schemas";
import { getDashboard } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/sales/dashboard?period=day|week|month|quarter&anchor=&trackId=: counts vs targets, rates, 8-period trend. */
export const GET = apiRoute(({ tx, query }) => getDashboard(tx, query(dashboardQuerySchema)));
