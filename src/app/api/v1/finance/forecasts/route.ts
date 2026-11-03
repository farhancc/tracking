import { forecastSchema } from "@/features/finance/schemas";
import { addForecast } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/finance/forecasts: { month, kind: income|expense, label, amount, source? } (plans, never mixed into actuals) */
export const POST = apiRoute(async ({ tx, body }) => addForecast(tx, await body(forecastSchema)), { status: 201 });
