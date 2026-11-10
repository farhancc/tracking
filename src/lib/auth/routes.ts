import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { getAuthDatabase } from "@/db/auth-client";
import { authenticateRequest } from "./current-user";
import { authError, authPost, clearAuthCookies, json, sessionToCookies, setChallengeCookie, setSessionCookies } from "./http";
import { ACCESS_COOKIE, MFA_COOKIE, REFRESH_COOKIE, signChallengeToken, verifyAccessToken, verifyChallengeToken } from "./jwt";
import * as flows from "./login";
import { isSameOrigin } from "./origin";
import { MIN_PASSWORD_LENGTH } from "./password";
import { requestMeta } from "./request-meta";

const GENERIC = "Email or password is incorrect, or sign-in is temporarily locked. Try again in a few minutes.";
const TOO_MANY = "Too many sign-in attempts from this network. Wait ten minutes and try again.";
const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");
const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/today");

async function challenge(request: NextRequest) {
  const token = request.cookies.get(MFA_COOKIE)?.value;
  return token ? verifyChallengeToken(token) : null;
}

/** POST /api/auth/login {email, password} → MFA challenge cookie. */
export const login = authPost(z.object({ email: z.string().trim().max(320), password: z.string().max(256) }), async ({ body, meta }) => {
  const r = await flows.passwordLogin(getAuthDatabase(), body.email, body.password, meta);
  if (!r.ok) return r.reason === "rate_limited" ? authError(429, "rate_limited", TOO_MANY) : authError(401, "invalid_credentials", GENERIC);
  const res = json({ next: r.enrolled ? "mfa" : "setup" });
  // Setup takes longer (install an app, scan a code), so its challenge lasts 10 minutes.
  setChallengeCookie(res, await signChallengeToken({ sub: r.userId, enrolled: r.enrolled }, r.enrolled ? 300 : 600), r.enrolled ? 300 : 600);
  return res;
});

/** POST /api/auth/mfa {code} | {recoveryCode} → session cookies. */
export const mfa = authPost(z.object({ code: code.optional(), recoveryCode: z.string().trim().min(10).max(20).optional(), next: z.string().max(500).optional() }), async ({ request, body, meta }) => {
  const c = await challenge(request);
  if (!c || !c.enrolled) return authError(401, "challenge_expired", "Your sign-in step expired. Enter your email and password again.");
  if (!body.code && !body.recoveryCode) return authError(400, "invalid_input", "Enter the 6-digit code or a recovery code.");
  const r = await flows.completeMfa(getAuthDatabase(), c.sub, body, meta);
  if (!r.ok) return r.reason === "rate_limited" ? authError(429, "rate_limited", TOO_MANY) : authError(401, "invalid_code", "That code didn't work. Codes change every 30 seconds and each works once.");
  const res = json({ next: safeNext(body.next), usedRecoveryCode: r.usedRecoveryCode, recoveryCodesLeft: r.recoveryCodesLeft });
  await setSessionCookies(res, sessionToCookies(r.session), r.usedRecoveryCode ? ["pwd", "recovery"] : ["pwd", "otp"]);
  res.cookies.set(MFA_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
});

/** POST /api/auth/mfa/setup {} → a new authenticator secret and QR code (first login only). */
export const setupStart = authPost(z.object({}).passthrough(), async ({ request }) => {
  const c = await challenge(request);
  if (!c || c.enrolled) return authError(401, "challenge_expired", "Your sign-in step expired. Enter your email and password again.");
  const r = await flows.startEnrollment(getAuthDatabase(), c.sub);
  if (!r.ok) return authError(409, "already_enrolled", "An authenticator is already set up. Sign in with its code.");
  const qrSvg = await QRCode.toString(r.otpauthUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return json({ secret: r.secret, otpauthUrl: r.otpauthUrl, qrSvg });
});

/** POST /api/auth/mfa/setup/confirm {code} → enables MFA, returns recovery codes once, signs in. */
export const setupConfirm = authPost(z.object({ code }), async ({ request, body, meta }) => {
  const c = await challenge(request);
  if (!c || c.enrolled) return authError(401, "challenge_expired", "Your sign-in step expired. Enter your email and password again.");
  const r = await flows.confirmEnrollment(getAuthDatabase(), c.sub, body.code, meta);
  if (!r.ok) {
    if (r.reason === "rate_limited") return authError(429, "rate_limited", TOO_MANY);
    return authError(r.reason === "already_enrolled" ? 409 : 401, "invalid_code", "That code didn't match. Check the time on your phone and try the newest code.");
  }
  const res = json({ recoveryCodes: r.recoveryCodes });
  await setSessionCookies(res, sessionToCookies(r.session));
  res.cookies.set(MFA_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
});

/** POST /api/auth/refresh {} → rotates the refresh token (clients that got a 401). */
export const refresh = authPost(z.object({}).passthrough(), async ({ request, meta }) => {
  const r = await flows.rotateRefresh(getAuthDatabase(), request.cookies.get(REFRESH_COOKIE)?.value ?? "", meta);
  if (!r.ok) {
    const res = authError(401, r.reason === "reuse" ? "session_revoked" : "unauthenticated", "Sign in again.");
    clearAuthCookies(res as NextResponse);
    return res;
  }
  const res = json({ ok: true });
  await setSessionCookies(res, r);
  return res;
});

/** POST /api/auth/logout (plain form post): revoke this session and clear every auth cookie. */
export async function logout(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Bad origin", { status: 403 });
  const db = getAuthDatabase();
  const meta = requestMeta(request.headers);
  const at = request.cookies.get(ACCESS_COOKIE)?.value;
  const claims = at ? await verifyAccessToken(at) : null;
  let sessionId = claims?.sid ?? null;
  if (!sessionId) {
    const rt = request.cookies.get(REFRESH_COOKIE)?.value;
    const r = rt ? await flows.rotateRefresh(db, rt, meta) : null;
    sessionId = r?.ok ? r.sessionId : null;
  }
  if (sessionId) await flows.logout(db, sessionId, meta);
  const res = NextResponse.redirect(new URL("/login", request.url), 303);
  clearAuthCookies(res);
  return res;
}

async function owner(request: NextRequest) {
  const auth = await authenticateRequest(request);
  return auth && auth.via === "cookie" ? auth.user : null;
}

/** POST /api/auth/logout-all {} → revoke every session and bump token_version. */
export const logoutAll = authPost(z.object({}).passthrough(), async ({ request, meta }) => {
  const u = await owner(request);
  if (!u) return authError(401, "unauthenticated", "Sign in again.");
  await flows.logoutEverywhere(getAuthDatabase(), u.userId, meta);
  const res = json({ ok: true });
  clearAuthCookies(res);
  return res;
});

/** POST /api/auth/password {currentPassword, newPassword, code} */
export const changePassword = authPost(z.object({ currentPassword: z.string().max(256), newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(256), code }), async ({ request, body, meta }) => {
  const u = await owner(request);
  if (!u) return authError(401, "unauthenticated", "Sign in again.");
  const r = await flows.changePassword(getAuthDatabase(), u.userId, body, meta);
  if (!r.ok) return r.reason === "policy" ? authError(422, "weak_password", "Choose a longer, more varied password that doesn't contain your email name.") : authError(401, "invalid_credentials", "The current password or the code is wrong.");
  const res = json({ ok: true });
  await setSessionCookies(res, sessionToCookies(r.session));
  return res;
});

/** POST /api/auth/sessions/revoke {sessionId} */
export const revokeSession = authPost(z.object({ sessionId: z.uuid() }), async ({ request, body, meta }) => {
  const u = await owner(request);
  if (!u) return authError(401, "unauthenticated", "Sign in again.");
  const ok = await flows.revokeOwnSession(getAuthDatabase(), u.userId, body.sessionId, meta);
  return ok ? json({ ok: true, current: body.sessionId === u.sessionId }) : authError(404, "not_found", "That session is already signed out.");
});

/** POST /api/auth/recovery-codes {code} → a new set of recovery codes, shown once. */
export const recoveryCodes = authPost(z.object({ code }), async ({ request, body, meta }) => {
  const u = await owner(request);
  if (!u) return authError(401, "unauthenticated", "Sign in again.");
  const r = await flows.regenerateRecoveryCodes(getAuthDatabase(), u.userId, body.code, meta);
  return r.ok ? json({ recoveryCodes: r.recoveryCodes }) : authError(401, "invalid_code", "That code didn't work.");
});

/** Settings → Security data for the signed-in owner (server components). */
export async function loadSecurityOverview(userId: string) {
  return flows.securityOverview(getAuthDatabase(), userId);
}
