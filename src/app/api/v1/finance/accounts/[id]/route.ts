import { z } from "zod";
import { archiveAccount } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** DELETE /api/v1/finance/accounts/:id (archives it; its balances stay in history) */
export const DELETE = apiRoute<{ id: string }>(({ tx, params }) => archiveAccount(tx, z.uuid().parse(params.id)));
