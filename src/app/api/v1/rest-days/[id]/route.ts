import { z } from "zod";
import { removeRestDay } from "@/features/habits/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/rest-days/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => removeRestDay(tx, z.uuid().parse(params.id)));
