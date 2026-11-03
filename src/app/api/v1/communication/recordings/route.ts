import { createRecording } from "@/features/communication/server/service";
import { apiRoute } from "@/lib/api/route";
import { AppError } from "@/lib/errors";
import { MAX_AUDIO_BYTES, getStorage } from "@/lib/storage";

/**
 * POST /api/v1/communication/recordings: multipart/form-data with `file` (audio, ≤ 4 MB)
 * and optional `durationSeconds`. Returns the recording; attach its id to practice or assessments.
 */
export const POST = apiRoute(
  async ({ request, tx, user }) => {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_AUDIO_BYTES + 64 * 1024) throw new AppError(413, "file_too_large", "Recordings can be up to 4 MB.");
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError(400, "invalid_upload", "Send the recording as multipart/form-data with a `file` field.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError(400, "invalid_upload", "Missing `file`.");
    const duration = Number(form.get("durationSeconds"));
    return createRecording(tx, getStorage(), {
      userId: user.userId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type || "application/octet-stream",
      durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    });
  },
  { status: 201 },
);
