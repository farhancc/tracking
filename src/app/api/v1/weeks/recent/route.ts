import { z } from "zod";
import { listRecentWeeks } from "@/features/weekly/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/weeks/recent?count=8: weekly scores (frozen for reviewed weeks). */
export const GET = apiRoute(({ tx, query }) => listRecentWeeks(tx, query(z.object({ count: z.coerce.number().int().min(1).max(26).default(8) })).count));
