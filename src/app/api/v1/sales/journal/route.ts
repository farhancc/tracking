import { journalCreateSchema, journalQuerySchema } from "@/features/sales/schemas";
import { createJournalEntry, listJournal } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/sales/journal?kind=&q=&tag= */
export const GET = apiRoute(({ tx, query }) => listJournal(tx, query(journalQuerySchema)));

/** POST /api/v1/sales/journal */
export const POST = apiRoute(async ({ tx, body }) => createJournalEntry(tx, await body(journalCreateSchema)), { status: 201 });
