/**
 * Access-token signing and verification (ES256 via jose).
 * Used by proxy.ts (signature check on every navigation) and by
 * requireUser() / authenticateRequest() (signature + session check).
 * See docs/06-security.md §3.
 */
import { createLocalJWKSet, importJWK, jwtVerify, SignJWT, type JSONWebKeySet, type JWK } from "jose";

export const ACCESS_COOKIE = "__Host-fyos_at";
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export type AccessClaims = {
  sub: string;
  sid: string;
  ver: number;
  aal: 2;
  amr: string[];
};

const issuer = () => process.env.AUTH_JWT_ISSUER ?? "fiveyearos";
const audience = () => process.env.AUTH_JWT_AUDIENCE ?? "fiveyearos-app";

let cachedJwks: { raw: string; set: ReturnType<typeof createLocalJWKSet> } | undefined;

function getJwks() {
  const raw = process.env.AUTH_JWT_PUBLIC_JWKS;
  if (!raw) throw new Error("AUTH_JWT_PUBLIC_JWKS is not set. Run `npm run auth:keygen`.");
  if (cachedJwks?.raw !== raw) {
    cachedJwks = { raw, set: createLocalJWKSet(JSON.parse(raw) as JSONWebKeySet) };
  }
  return cachedJwks.set;
}

/** Returns verified claims, or null for any invalid, expired or malformed token. */
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ["ES256"],
      issuer: issuer(),
      audience: audience(),
      clockTolerance: 5,
      requiredClaims: ["sub", "sid", "ver", "exp", "iat"],
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.ver !== "number" ||
      payload.aal !== 2
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      sid: payload.sid,
      ver: payload.ver,
      aal: 2,
      amr: Array.isArray(payload.amr) ? payload.amr.map(String) : [],
    };
  } catch {
    return null;
  }
}

export async function signAccessToken(
  claims: Omit<AccessClaims, "aal">,
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): Promise<string> {
  const raw = process.env.AUTH_JWT_PRIVATE_JWK;
  if (!raw) throw new Error("AUTH_JWT_PRIVATE_JWK is not set. Run `npm run auth:keygen`.");
  const jwk = JSON.parse(raw) as JWK;
  const key = await importJWK(jwk, "ES256");
  return new SignJWT({ sid: claims.sid, ver: claims.ver, aal: 2, amr: claims.amr })
    .setProtectedHeader({ alg: "ES256", kid: jwk.kid, typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(issuer())
    .setAudience(audience())
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setJti(crypto.randomUUID())
    .sign(key);
}

export function bearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// MFA challenge: proves the password step passed. aal 1, so verifyAccessToken
// rejects it; accepted only by the MFA endpoints.

export const MFA_COOKIE = "__Host-fyos_mfa";
export const REFRESH_COOKIE = "__Host-fyos_rt";
export type ChallengeClaims = { sub: string; enrolled: boolean };

export async function signChallengeToken(c: ChallengeClaims, ttlSeconds = 5 * 60): Promise<string> {
  const raw = process.env.AUTH_JWT_PRIVATE_JWK;
  if (!raw) throw new Error("AUTH_JWT_PRIVATE_JWK is not set. Run `npm run auth:keygen`.");
  const jwk = JSON.parse(raw) as JWK;
  const key = await importJWK(jwk, "ES256");
  return new SignJWT({ purpose: "mfa", aal: 1, enr: c.enrolled })
    .setProtectedHeader({ alg: "ES256", kid: jwk.kid, typ: "JWT" })
    .setSubject(c.sub)
    .setIssuer(issuer())
    .setAudience(`${audience()}:mfa`)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setJti(crypto.randomUUID())
    .sign(key);
}

export async function verifyChallengeToken(token: string): Promise<ChallengeClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), { algorithms: ["ES256"], issuer: issuer(), audience: `${audience()}:mfa`, clockTolerance: 5, requiredClaims: ["sub", "exp"] });
    if (payload.purpose !== "mfa" || typeof payload.sub !== "string") return null;
    return { sub: payload.sub, enrolled: payload.enr === true };
  } catch {
    return null;
  }
}
