import { settingsSchema } from "@/features/finance/schemas";
import { updateSettings } from "@/features/finance/server/service";
import { apiRoute } from "@/lib/api/route";

/** PATCH /api/v1/finance/settings: { currency?, withdrawalRatePct?, annualExpensesEstimate?, expectedReturnPct?, emergencyMonths? } */
export const PATCH = apiRoute(async ({ tx, body }) => updateSettings(tx, await body(settingsSchema)));
