import { dayQuery } from "@/features/today/api";
import { quickTaskSchema } from "@/features/today/schemas";
import { addTodayTask } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/today/tasks?day=: { title, estimatedMinutes?, scheduledStart?, goalId?, mitRank?, isDeliverable? } */
export const POST = apiRoute(async ({ tx, body, query }) => addTodayTask(tx, await body(quickTaskSchema), query(dayQuery).day), { status: 201 });
