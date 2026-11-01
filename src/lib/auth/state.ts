/**
 * Cheap session probe for endpoints that behave differently once signed in.
 * Never throws: an unreadable cookie simply means "anonymous".
 */
import { getSessionCookies } from "./session";
import { getValidAccessToken } from "./tokens";

export type SessionMode = "bearer" | "cookie" | "anonymous";

export async function sessionMode(): Promise<SessionMode> {
  const bearer = await getValidAccessToken().catch(() => null);
  if (bearer) return "bearer";
  const cookie = await getSessionCookies().catch(() => null);
  return cookie ? "cookie" : "anonymous";
}

export async function isSignedIn(): Promise<boolean> {
  return (await sessionMode()) !== "anonymous";
}
