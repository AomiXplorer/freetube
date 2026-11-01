/**
 * Cookie-backed OAuth token vault.
 *
 * The bundle (access token, refresh token, expiry, profile) is AES-GCM sealed
 * into an httpOnly cookie, so page JavaScript can never read a token and we keep
 * no server-side state. Refresh happens lazily inside route handlers, which are
 * allowed to rewrite the cookie.
 */
import { cookies } from "next/headers";
import { openJson, sealJson } from "./crypto";
import {
  needsRefresh,
  refreshTokens,
  type Profile,
  type TokenBundle,
} from "./oauth";

const TOKEN_COOKIE = "ft_oauth";
const PROFILE_COOKIE = "ft_profile";

type StoredBundle = TokenBundle & { profile?: Profile; email?: string };

export const TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export const PROFILE_COOKIE_OPTIONS = {
  httpOnly: false,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export async function getTokenBundle(): Promise<StoredBundle | null> {
  try {
    const jar = await cookies();
    const payload = jar.get(TOKEN_COOKIE)?.value;
    if (!payload) return null;
    return await openJson<StoredBundle>(payload);
  } catch {
    return null;
  }
}

export async function saveTokenBundle(bundle: StoredBundle): Promise<void> {
  const jar = await cookies();
  jar.set(TOKEN_COOKIE, await sealJson(bundle), TOKEN_COOKIE_OPTIONS);
  if (bundle.profile) {
    // Notifications/artwork only - never sensitive, so the UI may read it.
    jar.set(PROFILE_COOKIE, JSON.stringify(bundle.profile), PROFILE_COOKIE_OPTIONS);
  }
}

export async function clearTokenBundle(): Promise<void> {
  const jar = await cookies();
  jar.delete(TOKEN_COOKIE);
  jar.delete(PROFILE_COOKIE);
}

/**
 * Return a usable bearer token, refreshing silently when it is close to expiry.
 * Returns null when the user is anonymous or the refresh token was revoked.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const bundle = await getTokenBundle();
  if (!bundle) return null;
  if (!needsRefresh(bundle)) return bundle.accessToken;
  if (!bundle.refreshToken) return null;

  const refreshed = await refreshTokens(bundle.refreshToken, bundle);
  if (!refreshed) {
    console.warn("[auth] refresh_failed; clearing session");
    await clearTokenBundle();
    return null;
  }
  const next: StoredBundle = { ...refreshed, profile: bundle.profile };
  await saveTokenBundle(next);
  return next.accessToken;
}

export async function getProfile(): Promise<Profile | null> {
  const bundle = await getTokenBundle();
  return bundle?.profile ?? null;
}
