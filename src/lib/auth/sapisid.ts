/**
 * YouTube web clients authenticate with SAPISIDHASH:
 *   SAPISIDHASH <unix_ts>_<sha1(unix_ts + " " + SAPISID + " " + origin)>
 * Built with Web Crypto so it runs on Edge and Node alike.
 */
const ORIGIN = "https://www.youtube.com";

export function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    out[name] = part.slice(idx + 1).trim();
  }
  return out;
}

export async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sapisidHash(cookieHeader: string, timestamp?: number): Promise<string | null> {
  const cookies = parseCookieHeader(cookieHeader);
  const sapisid = cookies.SAPISID ?? cookies["__Secure-3PAPISID"] ?? cookies["__Secure-1PAPISID"];
  if (!sapisid) return null;
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const hash = await sha1Hex(`${ts} ${sapisid} ${ORIGIN}`);
  return `SAPISIDHASH ${ts}_${hash}`;
}
