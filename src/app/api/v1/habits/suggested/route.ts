import { addSuggestedHabits } from "@/features/habits/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/habits/suggested: adds any of the nine suggested habits you don't have */
export const POST = apiRoute(async ({ tx }) => ({ added: await addSuggestedHabits(tx) }));
