import { innertube, type Json } from "../client";
import { isSignedIn } from "@/lib/auth/state";
import { parseContinuationVideos, parseHome } from "../parse/home";
import { parseChannel } from "../parse/channel";
import { parsePlaylist } from "../parse/playlist";
import type { ChannelPage, HomeFeed, PlaylistPage, GuideEntry } from "../types";
import type { ClientName } from "../contexts";
import { text, findAll } from "../parse/walk";
import { searchVideos } from "./search";

/**
 * Home feed.
 *
 * Personalisation is credential- and client-specific:
 *  - an OAuth token (device flow) is only understood by the TV client, whose
 *    shelves use tileRenderer - the WEB endpoint behind a bearer returns the
 *    signed-out feed;
 *  - pasted cookies authenticate WEB, which owns the classic WEB feed;
 *  - signed-out visitors on a datacenter IP get an empty "start watching"
 *    nudge, so we substitute a real popular feed and say so in the payload.
 *
 * Every attempt is parsed before it is accepted, so an empty shelf set from the
 * first client falls through to the next one instead of silently degrading.
 */
export async function getHomeFeed(
  options: { params?: string; continuation?: string; fresh?: boolean } = {},
): Promise<HomeFeed & { source: "personal" | "popular"; client?: string; signedIn: boolean }> {
  const signedIn = await isSignedIn();
  const ttl = options.fresh ? 0 : undefined;

  if (options.continuation) {
    const { data, client } = await innertube({
      endpoint: "browse",
      body: { continuation: options.continuation },
      ttl: ttl ?? 180,
      cacheTag: `cont:${options.continuation.slice(0, 24)}`,
      clients: signedIn ? ["TVHTML5", "WEB", "MWEB"] : undefined,
      authenticated: true,
    });
    const { videos, continuation } = parseContinuationVideos(data);
    return {
      chips: [],
      sections: [{ items: videos }],
      continuation,
      source: "personal",
      client,
      signedIn,
    };
  }

  const attempts: { clients: ClientName[]; tag: string }[] = signedIn
    ? [
        { clients: ["TVHTML5"], tag: "tv" },
        { clients: ["WEB"], tag: "web" },
      ]
    : [{ clients: ["WEB", "MWEB", "ANDROID"], tag: "anon" }];

  let parseable: { feed: HomeFeed; client: ClientName } | undefined;
  let lastFeed: HomeFeed | undefined;

  for (const attempt of attempts) {
    try {
      const { data, client } = await innertube({
        endpoint: "browse",
        body: { browseId: "FEwhat_to_watch", ...(options.params ? { params: options.params } : {}) },
        ttl: ttl ?? 120,
        cacheTag: `home:${options.params ?? "default"}:${attempt.tag}`,
        clients: attempt.clients,
        authenticated: true,
      });
      const feed = parseHome(data as Json);
      lastFeed = feed;
      if (countItems(feed) > 0) {
        parseable = { feed, client };
        break;
      }
    } catch {
      // Try the next client; a structural failure is not a reason to blank the page.
    }
  }

  if (parseable) {
    return { ...parseable.feed, source: "personal", client: parseable.client, signedIn };
  }

  // Nothing personalised: keep the chips we did get, but serve a real feed.
  const fallback = await searchVideos("popular videos this week", {
    filters: { uploadDate: "week", sort: "views" },
  });
  return {
    chips: lastFeed?.chips ?? [],
    sections: [{ title: "Popular right now", items: fallback.videos }],
    continuation: fallback.continuation,
    source: "popular",
    signedIn,
  };
}

function countItems(feed: HomeFeed): number {
  return feed.sections.reduce((sum, section) => sum + section.items.length, 0);
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
