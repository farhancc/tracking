import { goalCreateSchema, goalListQuerySchema } from "@/features/goals/schemas";
import { createGoal, listGoals } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/goals?level=&pillarId=&status=&parentId=root|<id>&q=&includeArchived= */
export const GET = apiRoute(({ tx, query }) => listGoals(tx, query(goalListQuerySchema)));

/** POST /api/v1/goals */
export const POST = apiRoute(async ({ tx, body }) => createGoal(tx, await body(goalCreateSchema)), { status: 201 });
