import { z } from "zod";
import { practiceCreateSchema } from "@/features/communication/schemas";
import { listPractice, logPractice } from "@/features/communication/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/communication/practice?from=&to= */
export const GET = apiRoute(({ tx, query }) => listPractice(tx, query(z.object({ from: z.string().optional(), to: z.string().optional() }))));

/** POST /api/v1/communication/practice: practice never changes proficiency; assessments do. */
export const POST = apiRoute(async ({ tx, body }) => logPractice(tx, await body(practiceCreateSchema)), { status: 201 });
