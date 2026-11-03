import { z } from "zod";
import { startTask } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/tasks/:id/start */
export const POST = apiRoute<{ id: string }>(({ tx, params }) => startTask(tx, z.uuid().parse(params.id)));
