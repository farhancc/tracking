/**
 * Route guard. Verifies the access JWT's signature and claims only (no
 * database call) so navigation stays fast; requireUser() / apiRoute() then
 * confirm the session is still live before any data is read.
 *
 * Refresh-token rotation is added by the authentication milestone (M0).
 */
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, bearerToken, verifyAccessToken } from "@/lib/auth/jwt";

const PUBLIC_PATHS = ["/login", "/api/auth/", "/api/dev/login"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  const token = bearerToken(request.headers.get("authorization")) ?? request.cookies.get(ACCESS_COOKIE)?.value;
  if (token && (await verifyAccessToken(token))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json(
      { error: { code: "unauthenticated", message: "Sign in or send a valid Bearer token." } },
      { status: 401 },
    );
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)"],
};
