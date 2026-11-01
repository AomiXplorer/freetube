import { NextResponse } from "next/server";
import { getComments } from "@/lib/innertube/endpoints/next";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const continuation = url.searchParams.get("continuation");
  if (!continuation) return NextResponse.json({ error: "missing_continuation" }, { status: 400 });
  try {
    const page = await getComments(continuation);
    return NextResponse.json(page, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "comments_failed", message: (error as Error).message },
      { status: 502 },
    );
  }
}
