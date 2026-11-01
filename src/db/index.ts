"use client";

/**
 * Local-first storage (IndexedDB via Dexie).
 *
 * History, playlists, subscriptions and search history never leave the device.
 * The network layer only ever talks to YouTube through our own API routes.
 */
import Dexie, { type Table } from "dexie";

export type HistoryEntry = {
  videoId: string;
  title: string;
  channelName?: string;
  channelId?: string;
  thumbnail?: string;
  durationSeconds?: number;
  positionSeconds?: number;
  watchedAt: number;
  completed?: boolean;
};

export type Playlist = {
  id: string;
  name: string;
  description?: string;
  system?: "watch-later" | "liked" | null;
  createdAt: number;
  updatedAt: number;
};

export type PlaylistItem = {
  id: string;
  playlistId: string;
  videoId: string;
  title: string;
  channelName?: string;
  thumbnail?: string;
  durationSeconds?: number;
  addedAt: number;
};

export type Subscription = {
  channelId: string;
  name: string;
  avatar?: string;
  subscribedAt: number;
};

export type SearchEntry = {
  id?: number;
  query: string;
  searchedAt: number;
};

class FreetubeDB extends Dexie {
  history!: Table<HistoryEntry, string>;
  playlists!: Table<Playlist, string>;
  playlistItems!: Table<PlaylistItem, string>;
  subscriptions!: Table<Subscription, string>;
  searches!: Table<SearchEntry, number>;

  constructor() {
    super("freetube");
    this.version(1).stores({
      history: "videoId, watchedAt, completed",
      playlists: "id, updatedAt, system",
      playlistItems: "id, playlistId, videoId, addedAt",
      subscriptions: "channelId, subscribedAt",
      searches: "++id, query, searchedAt",
    });
  }
}

let instance: FreetubeDB | null = null;

export function db(): FreetubeDB {
  if (typeof window === "undefined") throw new Error("IndexedDB is client-only");
  if (!instance) instance = new FreetubeDB();
  return instance;
}

export const WATCH_LATER_ID = "watch-later";
export const LIKED_ID = "liked";

/** Create the two system playlists once, on first client boot. */
export async function ensureSystemPlaylists(): Promise<void> {
  const store = db();
  const now = Date.now();
  const existing = await store.playlists.bulkGet([WATCH_LATER_ID, LIKED_ID]);
  const missing: Playlist[] = [];
  if (!existing[0]) {
    missing.push({ id: WATCH_LATER_ID, name: "Watch later", system: "watch-later", createdAt: now, updatedAt: now });
  }
  if (!existing[1]) {
    missing.push({ id: LIKED_ID, name: "Liked videos", system: "liked", createdAt: now, updatedAt: now });
  }
  if (missing.length) await store.playlists.bulkPut(missing);
}

export async function recordHistory(entry: Omit<HistoryEntry, "watchedAt">): Promise<void> {
  const store = db();
  const previous = await store.history.get(entry.videoId);
  await store.history.put({
    ...previous,
    ...entry,
    watchedAt: Date.now(),
  });
}

export async function updateHistoryPosition(videoId: string, positionSeconds: number, completed = false) {
  const store = db();
  const existing = await store.history.get(videoId);
  if (!existing) return;
  await store.history.update(videoId, { positionSeconds, completed, watchedAt: Date.now() });
}

export async function clearHistory(): Promise<void> {
  await db().history.clear();
}

export async function removeHistoryEntry(videoId: string): Promise<void> {
  await db().history.delete(videoId);
}

export async function isSubscribed(channelId: string): Promise<boolean> {
  return Boolean(await db().subscriptions.get(channelId));
}

export async function toggleSubscription(subscription: Subscription): Promise<boolean> {
  const store = db();
  const existing = await store.subscriptions.get(subscription.channelId);
  if (existing) {
    await store.subscriptions.delete(subscription.channelId);
    return false;
  }
  await store.subscriptions.put(subscription);
  return true;
}

export async function createPlaylist(name: string, description?: string): Promise<Playlist> {
  const now = Date.now();
  const playlist: Playlist = {
    id: `pl_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    description,
    system: null,
    createdAt: now,
    updatedAt: now,
  };
  await db().playlists.put(playlist);
  return playlist;
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const store = db();
  await store.playlistItems.where("playlistId").equals(playlistId).delete();
  await store.playlists.delete(playlistId);
}

export async function addToPlaylist(playlistId: string, item: Omit<PlaylistItem, "id" | "playlistId" | "addedAt">): Promise<"added" | "exists"> {
  const store = db();
  const existing = await store.playlistItems
    .where("playlistId")
    .equals(playlistId)
    .and((entry) => entry.videoId === item.videoId)
    .first();
  if (existing) return "exists";
  await store.playlistItems.put({
    ...item,
    id: `${playlistId}_${item.videoId}`,
    playlistId,
    addedAt: Date.now(),
  });
  await store.playlists.update(playlistId, { updatedAt: Date.now() });
  return "added";
}

export async function removeFromPlaylist(playlistId: string, videoId: string): Promise<void> {
  await db().playlistItems.delete(`${playlistId}_${videoId}`);
}

export async function addSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  const store = db();
  const existing = await store.searches.where("query").equals(trimmed).first();
  if (existing?.id) {
    await store.searches.update(existing.id, { searchedAt: Date.now() });
    return;
  }
  await store.searches.add({ query: trimmed, searchedAt: Date.now() });
  const count = await store.searches.count();
  if (count > 40) {
    const oldest = await store.searches.orderBy("searchedAt").limit(count - 40).toArray();
    await store.searches.bulkDelete(oldest.map((entry) => entry.id as number));
  }
}

export async function clearSearches(): Promise<void> {
  await db().searches.clear();
}
