import { incomeSchema } from "@/features/finance/schemas";
import { addIncome } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/finance/income: { source, amount, receivedOn?, recurring?, description? } (actual, never in the future) */
export const POST = apiRoute(async ({ tx, body }) => addIncome(tx, await body(incomeSchema)), { status: 201 });
