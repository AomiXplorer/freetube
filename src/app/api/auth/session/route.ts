import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, getSessionCookies, sealCookies, openCookies } from "@/lib/auth/session";
import { parseCookieHeader } from "@/lib/auth/sapisid";

export const runtime = "nodejs";

/** POST { cookies: "<raw Cookie header from youtube.com>" } */
export async function POST(request: Request) {
  let body: { cookies?: string };
  try {
    body = (await request.json()) as { cookies?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const raw = (body.cookies ?? "").trim();
  if (!raw || raw.length > 20_000) {
    return NextResponse.json({ error: "invalid_cookies" }, { status: 400 });
  }

  const parsed = parseCookieHeader(raw);
  const required = ["SID", "__Secure-1PSID", "__Secure-3PSID"];
  if (!required.some((name) => parsed[name])) {
    return NextResponse.json(
      { error: "missing_sid", message: "Cookie header must include SID or __Secure-1PSID." },
      { status: 400 },
    );
  }

  const sealed = await sealCookies(raw);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sealed, SESSION_COOKIE_OPTIONS);

  // Report which cookies were seen (names only - never values).
  return NextResponse.json({
    status: "connected",
    cookies: Object.keys(parsed).length,
    hasAuth: Boolean(parsed.SAPISID ?? parsed["__Secure-3PAPISID"]),
  });
}

export async function GET() {
  const raw = await getSessionCookies();
  if (!raw) return NextResponse.json({ status: "anonymous" });
  const parsed = parseCookieHeader(raw);
  return NextResponse.json({
    status: "connected",
    cookies: Object.keys(parsed).length,
    hasAuth: Boolean(parsed.SAPISID ?? parsed["__Secure-3PAPISID"]),
  });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ status: "anonymous" });
}

/** Debug helper for local development only - reports integrity, never content. */
export async function PUT() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const raw = await getSessionCookies();
  if (!raw) return NextResponse.json({ status: "empty" });
  const roundTrip = await openCookies(await sealCookies(raw));
  return NextResponse.json({ status: "ok", matches: roundTrip === raw });
}
