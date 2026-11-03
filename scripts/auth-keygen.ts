/**
 * Generates an ES256 key pair for signing access tokens.
 * Paste the output into .env.local (development) or the Vercel project
 * environment (production). Rotation: add the new public key to the JWKS,
 * switch the private key, and remove the old public key after 15 minutes.
 */
import { exportJWK, generateKeyPair } from "jose";

const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
const kid = `fyos-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
const meta = { kid, alg: "ES256", use: "sig" };
const privateJwk = { ...(await exportJWK(privateKey)), ...meta };
const publicJwk = { ...(await exportJWK(publicKey)), ...meta };

console.log(`AUTH_JWT_PRIVATE_JWK='${JSON.stringify(privateJwk)}'`);
console.log(`AUTH_JWT_PUBLIC_JWKS='${JSON.stringify({ keys: [publicJwk] })}'`);
