import { z } from "zod";
import { deleteExpense } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/finance/expenses/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteExpense(tx, z.uuid().parse(params.id)));
