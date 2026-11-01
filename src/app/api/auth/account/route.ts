import { NextResponse } from "next/server";
import { getSessionCookies } from "@/lib/auth/session";
import { clearTokenBundle, getTokenBundle, getValidAccessToken } from "@/lib/auth/tokens";

export const runtime = "nodejs";

/** Who is signed in, and how. Never returns a token. */
export async function GET() {
  const bundle = await getTokenBundle();
  if (bundle) {
    const access = await getValidAccessToken();
    if (!access) return NextResponse.json({ mode: "anonymous" });
    return NextResponse.json({
      mode: "oauth",
      profile: bundle.profile ?? null,
      expiresAt: bundle.expiresAt,
      canRefresh: Boolean(bundle.refreshToken),
    });
  }
  const cookiesRaw = await getSessionCookies();
  if (cookiesRaw) {
    return NextResponse.json({ mode: "cookies" });
  }
  return NextResponse.json({ mode: "anonymous" });
}

/** Sign out of everything: OAuth tokens and pasted cookies. */
export async function DELETE() {
  await clearTokenBundle();
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  jar.delete("ft_session");
  return NextResponse.json({ mode: "anonymous" });
}
