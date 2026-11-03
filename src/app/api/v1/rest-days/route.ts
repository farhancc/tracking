import { restDaySchema } from "@/features/habits/schemas";
import { addRestDay } from "@/features/habits/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/rest-days: { day, reason? }: every habit is excused that day (may be planned ahead) */
export const POST = apiRoute(async ({ tx, body }) => addRestDay(tx, await body(restDaySchema)), { status: 201 });
