import { z } from "zod";
import { removeLink } from "@/features/goals/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/goals/:id/links/:relatedId */
export const DELETE = apiRoute<{ id: string; relatedId: string }>(({ tx, params }) =>
  removeLink(tx, z.uuid().parse(params.id), z.uuid().parse(params.relatedId)),
);
