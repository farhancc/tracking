import { z } from "zod";
import { deleteResource } from "@/features/communication/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/communication/resources/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteResource(tx, z.uuid().parse(params.id)));
