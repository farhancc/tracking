import { z } from "zod";
import { deleteActivity } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/sales/activities/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteActivity(tx, z.uuid().parse(params.id)));
