import { z } from "zod";
import { restoreGoal } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/goals/:id/restore: un-archives the goal and its sub-goals. */
export const POST = apiRoute<{ id: string }>(({ tx, params }) => restoreGoal(tx, z.uuid().parse(params.id)));
