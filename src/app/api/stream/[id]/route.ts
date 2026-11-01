import { NextResponse } from "next/server";
import { getPlayerData } from "@/lib/innertube/endpoints/player";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Stream URLs only - used to refresh expired googlevideo links mid-playback. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const data = await getPlayerData(id);
    return NextResponse.json(
      { playable: data.playable, reason: data.reason, streams: data.streams, captions: data.captions },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "stream_failed", message: (error as Error).message },
      { status: 502 },
    );
  }
}
