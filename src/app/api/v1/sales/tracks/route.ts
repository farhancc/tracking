import { trackCreateSchema } from "@/features/sales/schemas";
import { createTrack, ensureDefaultTrack, listTracks } from "@/features/sales/server/service";
import { apiRoute } from "@/lib/api/route";

/** GET /api/v1/sales/tracks */
export const GET = apiRoute(async ({ tx }) => {
  await ensureDefaultTrack(tx);
  return listTracks(tx);
});

/** POST /api/v1/sales/tracks: { name, currency, description?, isDefault? } */
export const POST = apiRoute(async ({ tx, body }) => createTrack(tx, await body(trackCreateSchema)), { status: 201 });
