import { innertube } from "../client";
import { parseWatchNext, type WatchPayload } from "../parse/video";
import { parseComments } from "../parse/comments";
import type { CommentsPage, VideoSummary } from "../types";
import { parseContinuationVideos } from "../parse/home";

/** Watch page metadata: title, channel, description, chapters, related videos. */
export async function getWatchNext(videoId: string): Promise<WatchPayload> {
  const { data } = await innertube({
    endpoint: "next",
    body: { videoId },
    ttl: 300,
    cacheTag: `watch:${videoId}`,
    authenticated: true,
  });
  return parseWatchNext(data, videoId);
}

export async function getComments(continuation: string): Promise<CommentsPage> {
  const { data } = await innertube({
    endpoint: "next",
    body: { continuation },
    ttl: 120,
    cacheTag: `comments:${continuation.slice(0, 24)}`,
    authenticated: true,
  });
  return parseComments(data);
}

/** "Load more" for the related rail. */
export async function getRelatedPage(continuation: string): Promise<{
  videos: VideoSummary[];
  continuation?: string;
}> {
  const { data } = await innertube({
    endpoint: "next",
    body: { continuation },
    ttl: 180,
    cacheTag: `nextcont:${continuation.slice(0, 24)}`,
  });
  return parseContinuationVideos(data);
}
