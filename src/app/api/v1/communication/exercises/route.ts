import { exerciseCreateSchema } from "@/features/communication/schemas";
import { addExercise } from "@/features/communication/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/communication/exercises: { skillId, title, instructions?, durationMinutes?, isDaily? } */
export const POST = apiRoute(async ({ tx, body }) => addExercise(tx, await body(exerciseCreateSchema)), { status: 201 });
