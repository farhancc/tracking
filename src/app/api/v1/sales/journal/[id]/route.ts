import { z } from "zod";
import { journalUpdateSchema } from "@/features/sales/schemas";
import { deleteJournalEntry, updateJournalEntry } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

type Params = { id: string };

/** PATCH /api/v1/sales/journal/:id */
export const PATCH = apiRoute<Params>(async ({ tx, params, body }) => updateJournalEntry(tx, z.uuid().parse(params.id), await body(journalUpdateSchema)));

/** DELETE /api/v1/sales/journal/:id */
export const DELETE = apiRoute<Params>(({ tx, params }) => deleteJournalEntry(tx, z.uuid().parse(params.id)));
