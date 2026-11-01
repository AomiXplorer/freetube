import type { PlaylistPage } from "../types";
import { collectVideos, findAll, findByKey, findContinuation, text, type J } from "./walk";

export function parsePlaylist(data: J, playlistId: string): PlaylistPage {
  const header = findByKey(data, "playlistHeaderRenderer") ?? {};
  const meta = findByKey(data, "microformatDataRenderer") ?? {};
  const owner = header.ownerText?.runs?.[0];

  const videos = collectVideos(findByKey(data, "playlistVideoListRenderer") ?? data);

  return {
    id: playlistId,
    title:
      text(header.title) ??
      text(findByKey(data, "pageHeaderViewModel")?.title) ??
      text(meta.title) ??
      "Playlist",
    description: text(header.descriptionText),
    channel: owner
      ? {
          name: text(owner) ?? "",
          id: owner.navigationEndpoint?.browseEndpoint?.browseId as string | undefined,
        }
      : undefined,
    videoCount: videos.length || undefined,
    views: text(header.viewCountText) ?? text(header.numVideosText),
    videos,
    continuation: findContinuation(data),
  };
}

/** Remote playlist shelves on a channel page (gridRenderer based). */
export function parsePlaylistShelves(data: J): { id: string; title: string }[] {
  return findAll(data, "gridPlaylistRenderer")
    .map((renderer) => ({
      id: String(renderer.playlistId ?? ""),
      title: text(renderer.title) ?? "",
    }))
    .filter((item) => Boolean(item.id));
}
