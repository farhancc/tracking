/**
 * DEVELOPMENT-ONLY sign-in, until the authentication milestone (M0) ships
 * password + TOTP login and refresh-token rotation.
 *
 * Active only when BOTH are true:
 *   - NODE_ENV === "development" (`next dev`; `next build`/`next start` and
 *     every Vercel deployment run with NODE_ENV=production), and
 *   - FYOS_DEV_LOGIN === "1".
 * Otherwise it responds 404. Remove this route when M0 lands.
 */
import { NextResponse, type NextRequest } from "next/server";
import { devLoginEnabled } from "@/lib/auth/dev";
import { ACCESS_COOKIE, signAccessToken } from "@/lib/auth/jwt";
import { isSameOrigin } from "@/lib/auth/origin";
import { createSession, findOrCreateUserByEmail } from "@/lib/auth/sessions";

const DEV_TOKEN_TTL_SECONDS = 12 * 60 * 60;

export async function POST(request: NextRequest) {
  if (!devLoginEnabled()) return new Response("Not found", { status: 404 });
  if (!isSameOrigin(request)) return new Response("Bad origin", { status: 403 });

  const email = process.env.FYOS_DEV_EMAIL ?? "owner@localhost";
  const userId = await findOrCreateUserByEmail(email);
  const { sessionId, tokenVersion } = await createSession(userId, {
    userAgent: request.headers.get("user-agent"),
    days: 1,
  });
  const token = await signAccessToken(
    { sub: userId, sid: sessionId, ver: tokenVersion, amr: ["dev"] },
    DEV_TOKEN_TTL_SECONDS,
  );

  const response = NextResponse.redirect(new URL("/today", request.url), 303);
  response.cookies.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEV_TOKEN_TTL_SECONDS,
  });
  return response;
}
