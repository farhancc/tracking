import type { NextRequest } from "next/server";

/** True when the request's Origin matches the host it was sent to (CSRF guard for cookie-authenticated POSTs). */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
