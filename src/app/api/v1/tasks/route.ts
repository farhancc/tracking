import { z } from "zod";
import { taskCreateSchema } from "@/features/goals/schemas";
import { createTask, listTasks } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

const listQuery = z.object({ goalId: z.uuid().optional() });

/** GET /api/v1/tasks?goalId= */
export const GET = apiRoute(({ tx, query }) => listTasks(tx, query(listQuery)));

/** POST /api/v1/tasks: tasks are activity; completing them never completes a goal. */
export const POST = apiRoute(async ({ tx, body }) => createTask(tx, await body(taskCreateSchema)), { status: 201 });
