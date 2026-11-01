import { NextResponse } from "next/server";
import { getPlayerData } from "@/lib/innertube/endpoints/player";
import { getWatchNext } from "@/lib/innertube/endpoints/next";
import type { VideoDetails } from "@/lib/innertube/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * One request per watch page: metadata + streams.
 *
 * Cached at the edge for 120s with stale-while-revalidate so repeat visits and
 * prefetches never wait on YouTube. Stream URLs inside the cache are still
 * valid (they live ~6h) - the client also gets `expiresAt` to refresh early.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[\w-]{11}$/.test(id)) {
    return NextResponse.json({ error: "invalid_video_id" }, { status: 400 });
  }

  const [player, watch] = await Promise.all([
    getPlayerData(id).catch((error) => ({ error: (error as Error).message })),
    getWatchNext(id).catch(() => null),
  ]);

  if ("error" in player) {
    return NextResponse.json(
      { error: "video_unavailable", message: player.error },
      { status: 502 },
    );
  }

  const base: VideoDetails =
    watch?.details ??
    ({
      id,
      title: player.details.title ?? "Video",
      description: player.details.description ?? "",
      channel: { id: player.details.channelId, name: player.details.author ?? "" },
      views: player.details.viewCount,
      durationSeconds: player.details.durationSeconds,
      thumbnails: [],
      isLive: Boolean(player.details.isLive),
      isUpcoming: false,
      isAgeRestricted: false,
      playable: true,
      chapters: [],
      captions: [],
    } satisfies VideoDetails);

  const details: VideoDetails = {
    ...base,
    id,
    playable: player.playable,
    playabilityReason: player.reason,
    captions: player.captions,
    chapters: (watch?.details.chapters?.length ? watch.details.chapters : player.chapters).map((c) => ({
      title: c.title,
      startSeconds: c.startSeconds,
    })),
    durationSeconds: base.durationSeconds ?? player.details.durationSeconds,
    isLive: base.isLive || Boolean(player.details.isLive),
  };

  return NextResponse.json(
    {
      details,
      streams: player.streams,
      related: watch?.related ?? [],
      commentsContinuation: watch?.commentsContinuation,
      source: { client: player.client },
    },
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } },
  );
}
