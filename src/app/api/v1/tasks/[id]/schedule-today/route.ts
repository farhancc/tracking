import { z } from "zod";
import { scheduleForToday } from "@/features/today/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/tasks/:id/schedule-today */
export const POST = apiRoute<{ id: string }>(({ tx, params }) => scheduleForToday(tx, z.uuid().parse(params.id)));
