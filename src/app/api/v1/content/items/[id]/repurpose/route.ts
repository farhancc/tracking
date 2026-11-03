import { z } from "zod";
import { repurposeSchema } from "@/features/content/schemas";
import { repurposeItem } from "@/features/content/server/service";
import { apiRoute } from "@/lib/api/route";

/** POST /api/v1/content/items/:id/repurpose: { platform, format, title? } → a new item at Script with the same research */
export const POST = apiRoute<{ id: string }>(async ({ tx, params, body }) => repurposeItem(tx, z.uuid().parse(params.id), await body(repurposeSchema)), { status: 201 });
