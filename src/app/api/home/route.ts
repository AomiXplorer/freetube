import { NextResponse } from "next/server";
import { getHomeFeed } from "@/lib/innertube/endpoints/browse";

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const feed = await getHomeFeed({
      params: url.searchParams.get("params") ?? undefined,
      continuation: url.searchParams.get("continuation") ?? undefined,
    });
    return NextResponse.json(feed, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "feed_unavailable", message: (error as Error).message },
      { status: 502 },
    );
  }
}
