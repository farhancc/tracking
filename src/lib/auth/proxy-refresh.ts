import "server-only";
import { getAuthDatabase } from "@/db/auth-client";
import { signAccessToken } from "./jwt";
import { rotateRefresh } from "./login";
import { requestMeta } from "./request-meta";

/** Rotates the refresh token for a navigation whose access token expired. Null when the session can't continue. */
export async function refreshForProxy(refreshToken: string, headers: Headers): Promise<{ accessToken: string; refreshToken: string | null } | null> {
  try {
    const r = await rotateRefresh(getAuthDatabase(), refreshToken, requestMeta(headers));
    if (!r.ok) return null;
    return { accessToken: await signAccessToken({ sub: r.userId, sid: r.sessionId, ver: r.tokenVersion, amr: ["pwd", "otp"] }), refreshToken: r.refreshToken };
  } catch (e) {
    console.error("refresh in proxy failed", e);
    return null;
  }
}
