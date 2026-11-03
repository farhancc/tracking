import { z } from "zod";
import { reportQuerySchema } from "@/features/products/schemas";
import { getReport } from "@/features/products/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/products/:id/report?from=&to=: monthly revenue, expenses and profit for one product */
export const GET = apiRoute<{ id: string }>(({ tx, params, query }) => getReport(tx, z.uuid().parse(params.id), query(reportQuerySchema)));
