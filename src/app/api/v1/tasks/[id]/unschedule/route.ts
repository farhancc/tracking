import { z } from "zod";
import { unscheduleTask } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/tasks/:id/unschedule */
export const POST = apiRoute<{ id: string }>(({ tx, params }) => unscheduleTask(tx, z.uuid().parse(params.id)));
