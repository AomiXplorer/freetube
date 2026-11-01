import { NextResponse } from "next/server";
import { getPlaylist } from "@/lib/innertube/endpoints/browse";

export const runtime = "edge";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const playlist = await getPlaylist(id);
    return NextResponse.json(playlist, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "playlist_failed", message: (error as Error).message },
      { status: 502 },
    );
  }
}
