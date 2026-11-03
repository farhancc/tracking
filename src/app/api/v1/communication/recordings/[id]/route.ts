import { z } from "zod";
import { deleteRecording, findRecording } from "@/features/communication/server/service";
import { apiRoute } from "@/lib/api/route";
import { notFound } from "@/lib/errors";
import { getStorage } from "@/lib/storage";

type Params = { id: string };

/** GET /api/v1/communication/recordings/:id: streams the audio (owner only), with Range support for seeking. */
export const GET = apiRoute<Params>(async ({ tx, params, request }) => {
  const rec = await findRecording(tx, z.uuid().parse(params.id));
  const bytes = await getStorage().get(rec.storageKey);
  if (!bytes) throw notFound("Recording file");
  const headers: Record<string, string> = {
    "Content-Type": rec.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = bytes.byteLength;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(new Blob([bytes.slice(start, end + 1) as BlobPart]), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(new Blob([bytes as BlobPart]), { headers: { ...headers, "Content-Length": String(bytes.byteLength) } });
});

/** DELETE /api/v1/communication/recordings/:id (refused while attached to practice or an assessment) */
export const DELETE = apiRoute<Params>(({ tx, params }) => deleteRecording(tx, getStorage(), z.uuid().parse(params.id)));
