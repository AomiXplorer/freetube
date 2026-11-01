import type { ChannelPage, PlaylistSummary } from "../types";
import { collectVideos, findAll, findByKey, findContinuation, text, thumbnails, type J } from "./walk";

export function parseChannel(data: J, channelId: string): ChannelPage {
  const header = findByKey(data, "pageHeaderViewModel") ?? findByKey(data, "c4TabbedHeaderRenderer") ?? {};

  const title =
    text(header.title) ??
    text(header.pageTitle) ??
    text(findByKey(data, "metadata")?.channelMetadataRenderer?.title) ??
    "";

  const metadataRows: any[] = findAll(header.metadata ?? {}, "contentMetadataViewModel")[0]?.metadataRows ?? [];
  const metadataParts = metadataRows
    .flatMap((row: any) => row.metadataParts ?? [])
    .map((part: any) => text(part?.text))
    .filter((v: unknown): v is string => typeof v === "string");

  const subscribers = metadataParts.find((p) => /subscriber/i.test(p)) ?? text(header.subscriberCountText);
  const videoCountText = metadataParts.find((p) => /video/i.test(p)) ?? text(header.videoCountText);

  const tabs = findAll(data, "tabRenderer")
    .map((tab) => ({
      title: text(tab.title) ?? "",
      params: tab.endpoint?.browseEndpoint?.params as string | undefined,
    }))
    .filter((tab) => Boolean(tab.title));

  const videos = collectVideos(data).filter((video) => video.kind !== "short");
  const shorts = collectVideos(data).filter((video) => video.kind === "short");

  const playlists: PlaylistSummary[] = findAll(data, "lockupViewModel")
    .filter((lockup) => String(lockup.contentType ?? "").includes("PLAYLIST"))
    .map((lockup) => ({
      id: String(lockup.contentId ?? ""),
      title: text(lockup.metadata?.lockupMetadataViewModel?.title) ?? "",
      thumbnails: thumbnails(lockup.contentImage),
    }))
    .filter((playlist) => Boolean(playlist.id && playlist.title));

  const description =
    text(header.description) ??
    (findByKey(data, "channelMetadataRenderer")?.description as string | undefined);

  const verified = Boolean(
    JSON.stringify(header.title ?? {}).includes("CHECK_CIRCLE") ||
      findAll(data, "badgeRenderer").some((b) => String(b.style ?? "").includes("VERIFIED")),
  );

  return {
    id: channelId,
    title,
    handle: text(header.metadata?.channelHandleText),
    description,
    avatar: thumbnails(header.image),
    banner: thumbnails(header.banner),
    subscribers,
    videoCountText,
    verified,
    tabs,
    videos,
    shorts,
    playlists,
    continuation: findContinuation(data),
  };
}
