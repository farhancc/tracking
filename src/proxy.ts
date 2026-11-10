/**
 * Route guard. Verifies the access JWT's signature and claims only (no
 * database call) so navigation stays fast; requireUser() / apiRoute() then
 * confirm the session is still live before any data is read.
 *
 * When the 15-minute access token has expired but a refresh token is present,
 * the session is rotated here (docs/06 §3.3) and the new access token is
 * passed to this same request, so the page or action carries on.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, ACCESS_TOKEN_TTL_SECONDS, bearerToken, MFA_COOKIE, REFRESH_COOKIE, verifyAccessToken } from "@/lib/auth/jwt";
import { refreshForProxy } from "@/lib/auth/proxy-refresh";

/** /api/cron/ checks its own secret; the PWA files must load before sign-in and offline. */
const PUBLIC_PATHS = ["/login", "/api/auth/", "/api/dev/login", "/api/cron/", "/sw.js", "/manifest.webmanifest", "/offline.html"];
const COOKIE = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

function withCookie(header: string | null, name: string, value: string) {
  const parts = (header ?? "").split(/;\s*/).filter((p) => p && !p.startsWith(`${name}=`));
  parts.push(`${name}=${value}`);
  return parts.join("; ");
}

function unauthenticated(request: NextRequest, clear: boolean) {
  const { pathname, search } = request.nextUrl;
  const res = pathname.startsWith("/api/")
    ? NextResponse.json({ error: { code: "unauthenticated", message: "Sign in or send a valid Bearer token." } }, { status: 401 })
    : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`${pathname}${search}`)}`, request.url));
  if (clear) for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, MFA_COOKIE]) res.cookies.set(name, "", { ...COOKIE, maxAge: 0 });
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  const bearer = bearerToken(request.headers.get("authorization"));
  if (bearer) return (await verifyAccessToken(bearer)) ? NextResponse.next() : unauthenticated(request, false);

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (token && (await verifyAccessToken(token))) return NextResponse.next();

  const rt = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!rt) return unauthenticated(request, false);
  const fresh = await refreshForProxy(rt, request.headers);
  if (!fresh) return unauthenticated(request, true);

  const headers = new Headers(request.headers);
  headers.set("cookie", withCookie(headers.get("cookie"), ACCESS_COOKIE, fresh.accessToken));
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(ACCESS_COOKIE, fresh.accessToken, { ...COOKIE, maxAge: ACCESS_TOKEN_TTL_SECONDS });
  if (fresh.refreshToken) res.cookies.set(REFRESH_COOKIE, fresh.refreshToken, { ...COOKIE, maxAge: 30 * 24 * 60 * 60 });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)"],
};
