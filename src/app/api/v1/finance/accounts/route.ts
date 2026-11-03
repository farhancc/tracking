import { accountSchema } from "@/features/finance/schemas";
import { createAccount } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/finance/accounts: { name, kind, interestRatePct?, notes?, balance? } */
export const POST = apiRoute(async ({ tx, body }) => createAccount(tx, await body(accountSchema)), { status: 201 });
