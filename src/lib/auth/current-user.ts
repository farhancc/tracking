import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { cache } from "react";
import { ACCESS_COOKIE, bearerToken, verifyAccessToken } from "./jwt";
import { isSessionActive } from "./sessions";

export type CurrentUser = { userId: string; sessionId: string };

async function resolve(token: string | null): Promise<CurrentUser | null> {
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  if (!(await isSessionActive(claims))) return null;
  return { userId: claims.sub, sessionId: claims.sid };
}

/** Pages and Server Actions. Verified once per request (React cache). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value ?? bearerToken((await headers()).get("authorization"));
  return resolve(token);
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Route handlers: cookie (browser) or `Authorization: Bearer` (API clients). */
export async function authenticateRequest(
  request: NextRequest,
): Promise<{ user: CurrentUser; via: "cookie" | "bearer" } | null> {
  const bearer = bearerToken(request.headers.get("authorization"));
  if (bearer) {
    const user = await resolve(bearer);
    return user ? { user, via: "bearer" } : null;
  }
  const cookie = request.cookies.get(ACCESS_COOKIE)?.value ?? null;
  const user = await resolve(cookie);
  return user ? { user, via: "cookie" } : null;
}
