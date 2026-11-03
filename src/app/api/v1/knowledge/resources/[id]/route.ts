import { z } from "zod";
import { resourceUpdateSchema } from "@/features/knowledge/schemas";
import { getResource, updateResource } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** GET /api/v1/knowledge/resources/:id: resource, concepts, applications (with linked task and journal entry), reading sessions */
export const GET = apiRoute<Params>(({ tx, params }) => getResource(tx, z.uuid().parse(params.id)));

/** PATCH /api/v1/knowledge/resources/:id: starting/completing fills the dates */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => updateResource(tx, z.uuid().parse(params.id), await body(resourceUpdateSchema)));
