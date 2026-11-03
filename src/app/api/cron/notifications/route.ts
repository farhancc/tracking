import { timingSafeEqual } from "node:crypto";
import { connection, type NextRequest } from "next/server";
import { runAllUsers } from "@/features/notifications/server/cron";

/**
 * GET|POST /api/cron/notifications. Call every 15 minutes from a scheduler
 * (Vercel Cron, GitHub Actions, cron + curl) with `Authorization: Bearer $CRON_SECRET`.
 * Each user's reminders are worked out in their own time zone; repeated calls
 * are safe because each reminder has a dedupe key.
 */
async function handle(request: NextRequest): Promise<Response> {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: { code: "not_configured", message: "CRON_SECRET is not set." } }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: { code: "unauthenticated", message: "Bad cron secret." } }, { status: 401 });
  }

  return Response.json({ data: await runAllUsers() }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
