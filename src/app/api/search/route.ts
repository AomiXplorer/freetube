import { NextResponse } from "next/server";
import { searchVideos } from "@/lib/innertube/endpoints/search";
import type { SearchFilters, SearchDuration, SearchSort, SearchType, SearchUploadDate } from "@/lib/innertube/params";

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const continuation = url.searchParams.get("continuation") ?? undefined;
  if (!query && !continuation) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }

  const filters: SearchFilters = {
    sort: (url.searchParams.get("sort") as SearchSort) ?? undefined,
    type: (url.searchParams.get("type") as SearchType) ?? undefined,
    duration: (url.searchParams.get("duration") as SearchDuration) ?? undefined,
    uploadDate: (url.searchParams.get("uploadDate") as SearchUploadDate) ?? undefined,
  };

  try {
    const result = await searchVideos(query ?? "", { filters, continuation });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "search_failed", message: (error as Error).message },
      { status: 502 },
    );
  }
}
