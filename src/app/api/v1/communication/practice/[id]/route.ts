import { z } from "zod";
import { deletePractice } from "@/features/communication/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/communication/practice/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deletePractice(tx, z.uuid().parse(params.id)));
