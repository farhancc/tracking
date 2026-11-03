import { assessmentCreateSchema } from "@/features/communication/schemas";
import { addAssessment } from "@/features/communication/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/communication/assessments: { skillId, level 1–10, method, evidence, assessor?, recordingId?, assessedOn?, notes? } */
export const POST = apiRoute(async ({ tx, body }) => addAssessment(tx, await body(assessmentCreateSchema)), { status: 201 });
