import { NextResponse } from "next/server";

export const runtime = "edge";

const ALLOWED_HOSTS = /(^|\.)(ytimg\.com|ggpht\.com|googleusercontent\.com)$/;

/**
 * Thumbnail proxy. Only needed when a client cannot reach i.ytimg.com directly
 * (some networks); images are tiny so this stays well inside Vercel limits.
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
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "image/jpeg");
  headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
  return new NextResponse(upstream.body, { status: 200, headers });
}
