"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback } from "react";
import {
  addSearch,
  addToPlaylist,
  clearHistory,
  clearSearches,
  createPlaylist,
  db,
  deletePlaylist,
  removeFromPlaylist,
  removeHistoryEntry,
  toggleSubscription,
  type Playlist,
  type PlaylistItem,
  type Subscription,
} from "./index";

const EMPTY: never[] = [];

export function useHistory(limit = 100) {
  const entries = useLiveQuery(
    () => db().history.orderBy("watchedAt").reverse().limit(limit).toArray(),
    [limit],
    EMPTY,
  );
  return { entries, clear: clearHistory, remove: removeHistoryEntry };
}

export function usePlaylists() {
  const playlists = useLiveQuery(() => db().playlists.orderBy("updatedAt").reverse().toArray(), [], EMPTY as Playlist[]);
  return {
    playlists,
    create: createPlaylist,
    remove: deletePlaylist,
  };
}

export function usePlaylistItems(playlistId: string) {
  const items = useLiveQuery(
    () => db().playlistItems.where("playlistId").equals(playlistId).sortBy("addedAt"),
    [playlistId],
    EMPTY as PlaylistItem[],
  );
  return {
    items: [...items].reverse(),
    add: (item: Omit<PlaylistItem, "id" | "playlistId" | "addedAt">) => addToPlaylist(playlistId, item),
    remove: (videoId: string) => removeFromPlaylist(playlistId, videoId),
  };
}

export function useSubscriptions() {
  const subscriptions = useLiveQuery(
    () => db().subscriptions.orderBy("subscribedAt").reverse().toArray(),
    [],
    EMPTY as Subscription[],
  );
  return { subscriptions };
}

export function useSubscription(channelId?: string) {
  const subscribed = useLiveQuery(
    async () => (channelId ? Boolean(await db().subscriptions.get(channelId)) : false),
    [channelId],
    false,
  );
  const toggle = useCallback(
    async (subscription: Omit<Subscription, "subscribedAt">) => {
      await toggleSubscription({ ...subscription, subscribedAt: Date.now() });
    },
    [],
  );
  return { subscribed, toggle };
}

export function useSearchHistory(limit = 10) {
  const entries = useLiveQuery(
    () => db().searches.orderBy("searchedAt").reverse().limit(limit).toArray(),
    [limit],
    EMPTY,
  );
  return { entries, add: addSearch, clear: clearSearches };
}

/** Add the current video to a playlist (or Watch later / Liked shortcuts). */
export function useAddToPlaylist() {
  return useCallback(
    async (
      playlistId: string,
      video: { videoId: string; title: string; channelName?: string; thumbnail?: string; durationSeconds?: number },
    ) => addToPlaylist(playlistId, video),
    [],
  );
}
