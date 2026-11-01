import { NextResponse } from "next/server";
import { getHomeFeed } from "@/lib/innertube/endpoints/browse";
import { sessionMode } from "@/lib/auth/state";

export const runtime = "edge";

/**
 * The response depends on the caller's session, so it must never be cached by a
 * shared CDN. Signed-out bodies stay cacheable; signed-in ones are private.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  try {
    const [mode, feed] = await Promise.all([
      sessionMode(),
      getHomeFeed({
        params: url.searchParams.get("params") ?? undefined,
        continuation: url.searchParams.get("continuation") ?? undefined,
        fresh: refresh,
      }),
    ]);
    return NextResponse.json(
      { ...feed, signedIn: mode !== "anonymous", source: feed.source },
      {
        headers: {
          "Cache-Control":
            mode === "anonymous"
              ? refresh
                ? "public, s-maxage=0, must-revalidate"
                : "private, no-cache"
              : "private, no-store",
          Vary: "Cookie, Authorization",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "feed_unavailable", message: (error as Error).message },
      { status: 502 },
    );
  }
}
