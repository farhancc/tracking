import { z } from "zod";
import { deleteSchema, habitUpdateSchema } from "@/features/habits/schemas";
import { deleteHabit, getHabitHistory, updateHabit } from "@/features/habits/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** GET /api/v1/habits/:id: history grid, notes, all-time consistency, streaks, missed analysis */
export const GET = apiRoute<Params>(({ tx, params }) => getHabitHistory(tx, z.uuid().parse(params.id)));

/** PATCH /api/v1/habits/:id: edit (or { archived: true } to keep history but hide it) */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => updateHabit(tx, z.uuid().parse(params.id), await body(habitUpdateSchema)));

/** DELETE /api/v1/habits/:id with { confirm: true }: deletes the habit and its check-ins for good */
export const DELETE = apiRoute<Params>(async ({ tx, params, body }) => {
  await body(deleteSchema);
  return deleteHabit(tx, z.uuid().parse(params.id));
});
