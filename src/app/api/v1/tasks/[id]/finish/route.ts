import { z } from "zod";
import { finishTask } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/tasks/:id/finish */
export const POST = apiRoute<{ id: string }>(({ tx, params }) => finishTask(tx, z.uuid().parse(params.id)));
