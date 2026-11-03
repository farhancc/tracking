import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/auth/jwt";
import { isSameOrigin } from "@/lib/auth/origin";
import { revokeSession } from "@/lib/auth/sessions";

/** POST /api/auth/logout: revokes the session server-side and clears the cookie. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Bad origin", { status: 403 });
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;
  if (claims) await revokeSession(claims.sid, "logout");

  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
