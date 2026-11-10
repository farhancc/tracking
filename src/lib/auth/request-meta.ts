/** Client IP prefix (/24 for IPv4, /56 for IPv6) and user agent, for rate limits and the audit log. Never the full IP. */
export type RequestMeta = { ipPrefix: string | null; userAgent: string | null };

export function ipPrefix(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v = ip.trim().replace(/^::ffff:/, "");
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(v);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (v.includes(":")) {
    // Expand "::" then keep the first 56 bits (3.5 groups).
    const [head, tail = ""] = v.split("::");
    const h = head ? head.split(":") : [];
    const t = tail ? tail.split(":") : [];
    const groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t].map((g) => g.padStart(4, "0").toLowerCase());
    if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{4}$/.test(g))) return null;
    return `${groups.slice(0, 3).join(":")}:${groups[3].slice(0, 2)}00::/56`;
  }
  return null;
}

/** First address in X-Forwarded-For (set by the hosting proxy), else X-Real-IP. */
export function requestMeta(headers: Headers): RequestMeta {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip");
  return { ipPrefix: ipPrefix(forwarded), userAgent: headers.get("user-agent")?.slice(0, 300) ?? null };
}
