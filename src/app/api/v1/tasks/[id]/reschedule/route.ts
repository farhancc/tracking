import { z } from "zod";
import { rescheduleSchema } from "@/features/weekly/schemas";
import { rescheduleTask } from "@/features/weekly/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/tasks/:id/reschedule: { dueOn }. The planned week follows the new date. */
export const POST = apiRoute<{ id: string }>(async ({ tx, params, body }) =>
  rescheduleTask(tx, z.uuid().parse(params.id), (await body(rescheduleSchema)).dueOn),
);
