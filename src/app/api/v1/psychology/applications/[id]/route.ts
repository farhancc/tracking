import { z } from "zod";
import { deleteApplication } from "@/features/psychology/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/psychology/applications/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteApplication(tx, z.uuid().parse(params.id)));
