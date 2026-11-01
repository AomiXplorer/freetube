import type { Chapter, VideoDetails, VideoSummary } from "../types";
import { parseCountLabel, parseDurationText } from "@/lib/utils/format";
import {
  collectVideos,
  deepWalk,
  findAll,
  findByKey,
  findContinuation,
  isObj,
  text,
  thumbnails,
  type J,
} from "./walk";

function parseChapters(data: J): Chapter[] {
  const chapters: Chapter[] = [];
  for (const marker of findAll(data, "macroMarkersListItemRenderer")) {
    const title = text(marker.title);
    const timeText = text(marker.timeDescription);
    const start = parseDurationText(timeText);
    if (!title || start == null) continue;
    chapters.push({ title, startSeconds: start, thumbnails: thumbnails(marker.thumbnail) });
  }
  return chapters;
}

export type WatchPayload = {
  details: VideoDetails;
  related: VideoSummary[];
  commentsContinuation?: string;
};

/** Parse the /next (watch page) response into domain details + related videos. */
export function parseWatchNext(data: J, videoId?: string): WatchPayload {
  const primary = findByKey(data, "videoPrimaryInfoRenderer") ?? {};
  const secondary = findByKey(data, "videoSecondaryInfoRenderer") ?? {};
  const owner = secondary.owner?.videoOwnerRenderer ?? {};

  const title = text(primary.title) ?? "";
  const viewCountText = text(primary.viewCount?.videoViewCountRenderer?.viewCount);
  const relativeDate = text(primary.dateText) ?? text(primary.relativeDateText);
  const likeButton = primary.videoActions?.menuRenderer?.topLevelButtons?.[0];
  const likeCountText =
    text(likeButton?.segmentedLikeDislikeButtonViewModel?.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel?.title) ??
    text(likeButton?.segmentedLikeDislikeButtonRenderer?.likeButtonRenderer?.likeCountText) ??
    text(likeButton?.segmentedLikeDislikeButtonViewModel?.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel?.accessibilityText);

  const description =
    text(secondary.attributedDescription) ??
    text(secondary.description) ??
    text(secondary.description?.runs);

  const related = collectVideos(
    findByKey(data, "secondaryResults") ?? data,
  ).filter((video) => video.id !== videoId);

  const commentsContinuation = findContinuation(data, "comment-item-section");

  return {
    details: {
      id: videoId ?? "",
      title,
      description: (description ?? "").trim(),
      channel: {
        id: owner.navigationEndpoint?.browseEndpoint?.browseId as string | undefined,
        name: text(owner.title) ?? "",
        avatar: thumbnails(owner.thumbnail),
        subscribers: text(owner.subscriberCountText),
        verified: Boolean(owner.badges?.some?.((b: any) => b?.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_VERIFIED")),
      },
      views: parseCountLabel(viewCountText),
      viewCountText,
      likeCountText,
      publishedText: relativeDate,
      thumbnails: thumbnails(findByKey(data, "videoPrimaryInfoRenderer")?.thumbnail),
      isLive: Boolean(primary.viewCount?.videoViewCountRenderer?.isLive),
      isUpcoming: Boolean(text(primary.dateText)?.toLowerCase().includes("premiere")),
      isAgeRestricted: false,
      playable: true,
      chapters: parseChapters(data),
      captions: [],
    },
    related,
    commentsContinuation,
  };
}

/** Comments can also carry the video's chapter markers, so expose the helper. */
export function chaptersFromAny(data: J): Chapter[] {
  return parseChapters(data);
}

/** Extract comment count text ("1,234 Comments") from a watch payload. */
export function commentCountFrom(data: J): string | undefined {
  let label: string | undefined;
  deepWalk(data, (node) => {
    if (label) return;
    const header = node.commentsHeaderRenderer;
    if (isObj(header)) {
      const count = text(header.countText);
      if (count) label = count;
    }
  });
  return label;
}
