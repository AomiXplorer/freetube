import type { ChannelRef, PlaylistSummary, SearchPage } from "../types";
import { collectVideos, findAll, findByKey, findContinuation, text, thumbnails, type J } from "./walk";

export function parseSearch(data: J, query: string): SearchPage {
  const videos = collectVideos(findByKey(data, "sectionListRenderer") ?? data);

  const channels: ChannelRef[] = findAll(data, "channelRenderer")
    .map((renderer) => ({
      id: renderer.channelId as string | undefined,
      name: text(renderer.title) ?? "",
      handle: text(renderer.subscriberCountText)?.startsWith("@")
        ? text(renderer.subscriberCountText)
        : (renderer.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl as string | undefined)?.replace(/^\//, ""),
      avatar: thumbnails(renderer.thumbnail),
      subscribers: text(renderer.videoCountText) ?? text(renderer.subscriberCountText),
      verified: Boolean(
        renderer.ownerBadges?.some?.(
          (b: any) => b?.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_VERIFIED",
        ),
      ),
    }))
    .filter((channel) => Boolean(channel.name));

  const playlists: PlaylistSummary[] = findAll(data, "lockupViewModel")
    .filter((lockup) => String(lockup.contentType ?? "").includes("PLAYLIST"))
    .map((lockup) => ({
      id: String(lockup.contentId ?? ""),
      title: text(lockup.metadata?.lockupMetadataViewModel?.title) ?? "",
      thumbnails: thumbnails(lockup.contentImage),
      videoCount: undefined,
    }))
    .filter((playlist) => Boolean(playlist.id && playlist.title));

  return {
    query,
    videos,
    channels,
    playlists,
    continuation: findContinuation(findByKey(data, "sectionListRenderer") ?? data),
  };
}
