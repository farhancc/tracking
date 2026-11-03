import { z } from "zod";
import { getOverview } from "@/features/communication/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/communication?day=: skills with assessment-based levels, daily exercises, monthly assessment progress. */
export const GET = apiRoute(({ tx, query }) => getOverview(tx, query(z.object({ day: z.string().optional() })).day));
