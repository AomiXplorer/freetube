import { NextResponse } from "next/server";

export const runtime = "edge";

const ALLOWED_HOSTS = /(^|\.)(youtube\.com|googlevideo\.com)$/;

/**
 * Subtitle proxy. Caption tracks are served from youtube.com without CORS
 * headers, so <track> cannot load them cross-origin. This is a few KB per
 * request and never touches video bytes.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) return new NextResponse("missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  if (!ALLOWED_HOSTS.test(parsed.hostname) || parsed.protocol !== "https:") {
    return new NextResponse("host not allowed", { status: 403 });
  }

  const upstream = await fetch(parsed.toString(), { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!upstream.ok) return new NextResponse("upstream error", { status: 502 });

  const headers = new Headers();
  headers.set("Content-Type", "text/vtt; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  return new NextResponse(upstream.body, { status: 200, headers });
}
