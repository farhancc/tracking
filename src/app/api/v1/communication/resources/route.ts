import { resourceCreateSchema } from "@/features/communication/schemas";
import { addResource } from "@/features/communication/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/communication/resources: { skillId, kind?, title, url?, notes? } */
export const POST = apiRoute(async ({ tx, body }) => addResource(tx, await body(resourceCreateSchema)), { status: 201 });
