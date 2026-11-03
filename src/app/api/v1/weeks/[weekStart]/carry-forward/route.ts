import { weekStartSchema } from "@/features/weekly/schemas";
import { carryForwardAll } from "@/features/weekly/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/weeks/:weekStart/carry-forward: move every unfinished earlier task into this week. */
export const POST = apiRoute<{ weekStart: string }>(({ tx, params }) => carryForwardAll(tx, weekStartSchema.parse(params.weekStart)));
