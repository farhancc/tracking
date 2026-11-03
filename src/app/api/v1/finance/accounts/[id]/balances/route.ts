import { z } from "zod";
import { balanceSchema } from "@/features/finance/schemas";
import { recordBalance } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/finance/accounts/:id/balances: { balance, asOf? } (upsert per date; debts as the amount owed) */
export const POST = apiRoute<{ id: string }>(async ({ tx, params, body }) => recordBalance(tx, z.uuid().parse(params.id), await body(balanceSchema)), { status: 201 });
