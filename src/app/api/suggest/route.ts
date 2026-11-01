import { NextResponse } from "next/server";
import { suggestQueries } from "@/lib/innertube/endpoints/search";

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ suggestions: [] });
  const suggestions = await suggestQueries(query);
  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } },
  );
}
