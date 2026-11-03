import { z } from "zod";
import { applicationUpdateSchema } from "@/features/knowledge/schemas";
import { deleteApplication, updateApplication } from "@/features/knowledge/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** PATCH /api/v1/knowledge/applications/:id: { description?, status?, result?, appliedOn?, journalEntryId? } */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => updateApplication(tx, z.uuid().parse(params.id), await body(applicationUpdateSchema)));

/** DELETE /api/v1/knowledge/applications/:id (the linked task and journal entry stay) */
export const DELETE = apiRoute<Params>(({ tx, params }) => deleteApplication(tx, z.uuid().parse(params.id)));
