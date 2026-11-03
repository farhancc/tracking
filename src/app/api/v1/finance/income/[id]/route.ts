import { z } from "zod";
import { deleteIncome } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/finance/income/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteIncome(tx, z.uuid().parse(params.id)));
