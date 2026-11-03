import { z } from "zod";
import { markRead } from "@/features/notifications/server/service";
import { apiRoute } from "@/lib/api/route";

const schema = z.object({ id: z.union([z.uuid(), z.literal("all")]) });

/** POST /api/v1/notifications/read { id: uuid | "all" } */
export const POST = apiRoute(async ({ tx, body }) => markRead(tx, (await body(schema)).id));
