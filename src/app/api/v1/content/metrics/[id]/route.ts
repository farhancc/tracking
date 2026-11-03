import { z } from "zod";
import { deleteMetrics } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/content/metrics/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteMetrics(tx, z.uuid().parse(params.id)));
