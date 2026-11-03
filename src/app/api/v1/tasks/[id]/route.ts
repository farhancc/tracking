import { z } from "zod";
import { taskUpdateSchema } from "@/features/goals/schemas";
import { updateTask } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** PATCH /api/v1/tasks/:id */
export const PATCH = apiRoute<{ id: string }>(async ({ tx, params, body }) =>
  updateTask(tx, z.uuid().parse(params.id), await body(taskUpdateSchema)),
);
