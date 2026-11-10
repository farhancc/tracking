import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ACCESS_COOKIE, ACCESS_TOKEN_TTL_SECONDS, MFA_COOKIE, REFRESH_COOKIE, signAccessToken } from "./jwt";
import type { NewSession } from "./login";
import { isSameOrigin } from "./origin";
import { requestMeta, type RequestMeta } from "./request-meta";

const COOKIE = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
export const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const authError = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

export async function setSessionCookies(res: NextResponse, s: { userId: string; sessionId: string; tokenVersion: number; refreshToken: string | null }, amr: string[] = ["pwd", "otp"]) {
  const at = await signAccessToken({ sub: s.userId, sid: s.sessionId, ver: s.tokenVersion, amr });
  res.cookies.set(ACCESS_COOKIE, at, { ...COOKIE, maxAge: ACCESS_TOKEN_TTL_SECONDS });
  if (s.refreshToken) res.cookies.set(REFRESH_COOKIE, s.refreshToken, { ...COOKIE, maxAge: REFRESH_MAX_AGE });
  return at;
}

export function clearAuthCookies(res: NextResponse) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, MFA_COOKIE]) res.cookies.set(name, "", { ...COOKIE, maxAge: 0 });
}

export function setChallengeCookie(res: NextResponse, token: string, maxAge = 5 * 60) {
  res.cookies.set(MFA_COOKIE, token, { ...COOKIE, maxAge });
}

export const sessionToCookies = (s: NewSession) => ({ userId: s.userId, sessionId: s.sessionId, tokenVersion: s.tokenVersion, refreshToken: s.refreshToken });

/**
 * Auth endpoints accept only same-origin POSTs with a JSON body (SEC-AUTH-11).
 * The body is validated; failures return a generic 400.
 */
export function authPost<S extends z.ZodType>(schema: S, handler: (ctx: { request: NextRequest; body: z.infer<S>; meta: RequestMeta }) => Promise<Response>) {
  return async (request: NextRequest): Promise<Response> => {
    if (!isSameOrigin(request)) return authError(403, "bad_origin", "Cross-origin requests are not allowed.");
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) return authError(415, "unsupported_media_type", "Send JSON.");
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return authError(400, "invalid_json", "The request body is not valid JSON.");
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return authError(400, "invalid_input", "Check the form and try again.");
    try {
      return await handler({ request, body: parsed.data, meta: requestMeta(request.headers) });
    } catch (e) {
      console.error("auth route failed", e);
      return authError(500, "server_error", "Something went wrong. Try again.");
    }
  };
}
