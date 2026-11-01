/**
 * Encrypted (AES-GCM) storage for a user's own YouTube cookie string.
 *
 * - Plaintext never leaves the request: it is encrypted before it is written to
 *   an httpOnly, sameSite=lax cookie; the key is derived from SESSION_SECRET.
 * - The value is never logged. All usage goes through getSessionCookies().
 */
import { cookies } from "next/headers";

const COOKIE_NAME = "ft_session";
const IV_BYTES = 12;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function deriveKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET ?? "freetube-development-only-secret-change-me";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function sealCookies(cookieString: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(cookieString),
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return toBase64Url(combined);
}

export async function openCookies(payload: string): Promise<string | null> {
  try {
    const combined = fromBase64Url(payload);
    const iv = combined.slice(0, IV_BYTES);
    const data = combined.slice(IV_BYTES);
    const key = await deriveKey();
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

/** Read + decrypt the caller's YouTube cookies, or null in anonymous mode. */
export async function getSessionCookies(): Promise<string | null> {
  try {
    const jar = await cookies();
    const payload = jar.get(COOKIE_NAME)?.value;
    if (!payload) return null;
    return await openCookies(payload);
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};
