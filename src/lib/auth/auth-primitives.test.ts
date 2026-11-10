import { describe, expect, it } from "vitest";
import { breachCount, checkPasswordPolicy, hashSecret, needsRehash, verifySecret } from "./password";
import { ipPrefix } from "./request-meta";
import { open, seal } from "./secret-box";
import { base32Decode, base32Encode, generateRecoveryCodes, hotp, normalizeRecoveryCode, otpauthUrl, stepAt, verifyTotp } from "./totp";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("TOTP", () => {
  it("matches the RFC 4226 and RFC 6238 test vectors", () => {
    const secret = Buffer.from("12345678901234567890");
    expect([0, 1, 2, 9].map((c) => hotp(secret, c))).toEqual(["755224", "287082", "359152", "520489"]);
    for (const [t, want] of [[59, "94287082"], [1111111109, "07081804"], [1234567890, "89005924"], [2000000000, "69279037"]] as const) {
      expect(hotp(secret, Math.floor(t / 30), 8)).toBe(want);
    }
  });

  it("base32-encodes like RFC 4648", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
  });

  it("accepts ±1 step, rejects replays, older steps and junk", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = new Date(1_700_000_000_000);
    const step = stepAt(now);
    const key = base32Decode(secret);
    expect(verifyTotp(secret, hotp(key, step), null, now)).toBe(step);
    expect(verifyTotp(secret, hotp(key, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, hotp(key, step + 1), null, now)).toBe(step + 1);
    expect(verifyTotp(secret, hotp(key, step - 2), null, now)).toBeNull();
    expect(verifyTotp(secret, hotp(key, step), step, now)).toBeNull(); // replay
    expect(verifyTotp(secret, hotp(key, step - 1), step - 1, now)).toBeNull();
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", null, now)).toBeNull();
    expect(verifyTotp(secret, ` ${hotp(key, step).slice(0, 3)} ${hotp(key, step).slice(3)} `, null, now)).toBe(step);
  });

  it("makes otpauth URLs and distinct recovery codes", () => {
    expect(otpauthUrl("ABC", "me@x.com")).toBe("otpauth://totp/FiveYearOS%3Ame%40x.com?secret=ABC&issuer=FiveYearOS&algorithm=SHA1&digits=6&period=30");
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((c) => /^[a-z2-7]{5}-[a-z2-7]{5}$/.test(c))).toBe(true);
    expect(normalizeRecoveryCode(" AbCdE-FgHiJ ")).toBe("abcdefghij");
  });
});

describe("secret box", () => {
  it("round-trips, uses a fresh nonce, and detects tampering or a wrong key", () => {
    const a = seal("JBSWY3DPEHPK3PXP", KEY);
    expect(a).not.toBe(seal("JBSWY3DPEHPK3PXP", KEY));
    expect(open(a, KEY)).toBe("JBSWY3DPEHPK3PXP");
    const [v, n, b] = a.split(".");
    const flipped = `${v}.${n}.${b.slice(0, -2)}${b.endsWith("A") ? "B" : "A"}${b.slice(-1)}`;
    expect(() => open(flipped, KEY)).toThrow();
    expect(() => open(a, Buffer.alloc(32, 8).toString("base64"))).toThrow();
    expect(() => seal("x", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("passwords", () => {
  it("hashes with argon2id and verifies; unknown users cost a dummy verify and fail", async () => {
    const h = await hashSecret("correct horse battery staple");
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifySecret(h, "correct horse battery staple")).toBe(true);
    expect(await verifySecret(h, "wrong")).toBe(false);
    expect(await verifySecret(null, "anything")).toBe(false);
    expect(await verifySecret("not-a-hash", "x")).toBe(false);
    expect(needsRehash(h)).toBe(false);
    expect(needsRehash("$argon2id$v=19$m=4096,t=3,p=1$abc$def")).toBe(true);
  });

  it("enforces the policy", () => {
    expect(checkPasswordPolicy("short").ok).toBe(false);
    expect(checkPasswordPolicy("aaaaaaaaaaaaaaaa").ok).toBe(false);
    expect(checkPasswordPolicy("farhan-2026-secret!", "farhan@example.com").ok).toBe(false);
    expect(checkPasswordPolicy("plum-orbit-73-lantern").ok).toBe(true);
  });

  it("checks Pwned Passwords by k-anonymity and fails open", async () => {
    let asked = "";
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const fake = (async (url: string) => {
      asked = url;
      return new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\nABCDEF:1");
    }) as unknown as typeof fetch;
    expect(await breachCount("password", fake)).toBe(9545824);
    expect(asked).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect(await breachCount("plum-orbit-73-lantern", fake)).toBe(0);
    expect(await breachCount("x", (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe("unknown");
  });
});

describe("request meta", () => {
  it("keeps only the network prefix", () => {
    expect(ipPrefix("203.0.113.77")).toBe("203.0.113.0/24");
    expect(ipPrefix("::ffff:198.51.100.9")).toBe("198.51.100.0/24");
    expect(ipPrefix("2001:db8:abcd:12ff::1")).toBe("2001:0db8:abcd:1200::/56");
    expect(ipPrefix("garbage")).toBeNull();
    expect(ipPrefix(null)).toBeNull();
  });
});
