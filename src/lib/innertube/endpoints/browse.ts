import { innertube } from "../client";
import { isEmptyFeed, parseContinuationVideos, parseHome } from "../parse/home";
import { parseChannel } from "../parse/channel";
import { parsePlaylist } from "../parse/playlist";
import type { ChannelPage, HomeFeed, PlaylistPage, GuideEntry } from "../types";
import { text, findAll } from "../parse/walk";
import { searchVideos } from "./search";

/**
 * Home feed.
 *
 * Signed-out users on a fresh datacenter IP get YouTube's "Try searching to get
 * started" nudge (an empty feed). Rather than showing a blank page we fall back
 * to a real, non-personalised feed built from search results, and label it.
 */
export async function getHomeFeed(options: { params?: string; continuation?: string } = {}): Promise<
  HomeFeed & { fallback?: boolean }
> {
  if (options.continuation) {
    const { data } = await innertube({
      endpoint: "browse",
      body: { continuation: options.continuation },
      ttl: 180,
      cacheTag: `cont:${options.continuation.slice(0, 24)}`,
      authenticated: true,
    });
    const { videos, continuation } = parseContinuationVideos(data);
    return { chips: [], sections: [{ items: videos }], continuation };
  }

  const { data } = await innertube({
    endpoint: "browse",
    body: { browseId: "FEwhat_to_watch", ...(options.params ? { params: options.params } : {}) },
    ttl: 120,
    cacheTag: `home:${options.params ?? "default"}`,
    authenticated: true,
  });

  const feed = parseHome(data);
  const itemCount = feed.sections.reduce((sum, section) => sum + section.items.length, 0);

  if (!feed.chips.length && options.params) {
    // Chip navigation responses only contain the grid, so re-read chips lazily.
    feed.chips = [];
  }

  if (itemCount === 0 || isEmptyFeed(data)) {
    const fallback = await searchVideos("popular videos this week", {
      filters: { uploadDate: "week", sort: "views" },
    });
    return {
      chips: feed.chips,
      sections: [{ title: "Popular right now", items: fallback.videos }],
      continuation: fallback.continuation,
      fallback: true,
    };
  }

  return { ...feed, fallback: false };
}

/** Channel home / tab payload (tab params come from the parsed channel page). */
export async function getChannel(channelId: string, params?: string): Promise<ChannelPage> {
  const { data } = await innertube({
    endpoint: "browse",
    body: { browseId: channelId, ...(params ? { params } : {}) },
    ttl: 300,
    cacheTag: `channel:${channelId}:${params ?? "home"}`,
  });
  return parseChannel(data, channelId);
}

/** Remote playlist (e.g. "Liked videos", "Watch later", public playlists). */
export async function getPlaylist(playlistId: string): Promise<PlaylistPage> {
  const { data } = await innertube({
    endpoint: "browse",
    body: { browseId: `VL${playlistId.replace(/^VL/, "")}` },
    ttl: 300,
    cacheTag: `playlist:${playlistId}`,
    authenticated: true,
  });
  return parsePlaylist(data, playlistId);
}

/** Sidebar guide. Falls back to a local static list when the endpoint is gated. */
export async function getGuide(): Promise<GuideEntry[]> {
  try {
    const { data } = await innertube({
      endpoint: "guide",
      body: {},
      ttl: 3600,
      cacheTag: "guide",
      authenticated: true,
    });
    const entries: GuideEntry[] = [];
    for (const section of findAll(data, "guideSectionRenderer")) {
      for (const item of section.items ?? []) {
        const entry = item.guideEntryRenderer;
        if (!entry) continue;
        const title = text(entry.formattedTitle) ?? "";
        if (!title) continue;
        entries.push({
          title,
          browseId: entry.navigationEndpoint?.browseEndpoint?.browseId as string | undefined,
          url: entry.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url as string | undefined,
          icon: entry.icon?.iconType as string | undefined,
          isPrimary: Boolean(entry.isPrimary),
        });
      }
    }
    if (entries.length) return entries;
  } catch {
    // fall through to static guide
  }
  return STATIC_GUIDE;
}

export const STATIC_GUIDE: GuideEntry[] = [
  { title: "Home", browseId: "FEwhat_to_watch", url: "/", icon: "HOME", isPrimary: true },
  { title: "Shorts", url: "/shorts", icon: "SHORTS", isPrimary: true },
  { title: "Subscriptions", browseId: "FEsubscriptions", url: "/subscriptions", icon: "SUBSCRIPTIONS", isPrimary: true },
  { title: "Library", browseId: "FElibrary", url: "/library", icon: "VIDEO_LIBRARY", isPrimary: true },
  { title: "History", browseId: "FEhistory", url: "/history", icon: "HISTORY" },
];
