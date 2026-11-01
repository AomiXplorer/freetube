/**
 * Encrypted (AES-GCM) storage for a user's own YouTube cookie string.
 *
 * - Plaintext never leaves the request: it is encrypted before it is written to
 *   an httpOnly, sameSite=lax cookie; the key is derived from SESSION_SECRET.
 * - The value is never logged. All usage goes through getSessionCookies().
 */
import { cookies } from "next/headers";
import { openString, sealString } from "./crypto";

const COOKIE_NAME = "ft_session";

export async function sealCookies(cookieString: string): Promise<string> {
  return sealString(cookieString);
}

export async function openCookies(payload: string): Promise<string | null> {
  return openString(payload);
}

/** Read + decrypt the caller's YouTube cookies, or null in anonymous mode. */
export async function getSessionCookies(): Promise<string | null> {
  try {
    const jar = await cookies();
    const payload = jar.get(COOKIE_NAME)?.value;
    if (!payload) return null;
    return await openString(payload);
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
