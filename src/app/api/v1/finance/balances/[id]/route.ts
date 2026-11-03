import { z } from "zod";
import { deleteBalance } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/finance/balances/:id */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => deleteBalance(tx, z.uuid().parse(params.id)));
