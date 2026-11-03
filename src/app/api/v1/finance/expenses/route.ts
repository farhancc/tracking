import { expenseSchema } from "@/features/finance/schemas";
import { addExpense } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/finance/expenses: { category, amount, spentOn?, essential?, description? } */
export const POST = apiRoute(async ({ tx, body }) => addExpense(tx, await body(expenseSchema)), { status: 201 });
