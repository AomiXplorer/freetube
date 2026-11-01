"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ListVideo, Play, Trash2 } from "lucide-react";
import { fetchPlaylist } from "@/lib/api/client";
import { usePlaylistItems, usePlaylists } from "@/db/hooks";
import { LIKED_ID, WATCH_LATER_ID } from "@/db";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "@/lib/utils/format";
import { usePlayerStore } from "@/store/player";
import type { QueueItem } from "@/store/player";

export function PlaylistPage() {
  const params = useParams<{ id: string }>();
  const playlistId = params?.id ?? "";
  const isLocal = playlistId === WATCH_LATER_ID || playlistId === LIKED_ID;
  const { playlists } = usePlaylists();
  const localPlaylist = playlists.find((playlist) => playlist.id === playlistId);
  const localItems = usePlaylistItems(playlistId);
  const setQueue = usePlayerStore((state) => state.setQueue);

  const remote = useQuery({
    queryKey: ["playlist", playlistId],
    queryFn: () => fetchPlaylist(playlistId),
    enabled: Boolean(playlistId) && !isLocal,
    staleTime: 300_000,
  });

  const title = isLocal || localPlaylist ? (localPlaylist?.name ?? "Playlist") : remote.data?.title ?? "Playlist";
  const rows: QueueItem[] = isLocal
    ? localItems.items.map((item) => ({
        videoId: item.videoId,
        title: item.title,
        channelName: item.channelName,
        thumbnail: item.thumbnail,
        durationSeconds: item.durationSeconds,
      }))
    : (remote.data?.videos ?? []).map((video) => ({
        videoId: video.id,
        title: video.title,
        channelName: video.channel.name,
        thumbnail: video.thumbnails.at(-1)?.url,
        durationSeconds: video.durationSeconds,
      }));

  const loading = isLocal ? false : remote.isLoading;

  return (
    <div className="pb-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex size-32 items-center justify-center rounded-xl bg-secondary">
          <ListVideo className="size-10 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} video{rows.length === 1 ? "" : "s"}
            {isLocal ? " · saved on this device" : remote.data?.channel?.name ? ` · ${remote.data.channel.name}` : ""}
          </p>
          {rows.length ? (
            <Button className="mt-3" onClick={() => setQueue(rows, 0)}>
              <Play className="size-4" /> Play all
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : !rows.length ? (
        <p className="py-10 text-sm text-muted-foreground">This playlist is empty.</p>
      ) : (
        <ol className="divide-y divide-border">
          {rows.map((row, index) => (
            <li key={`${row.videoId}-${index}`} className="flex items-center gap-3 py-3">
              <button
                type="button"
                onClick={() =>
                  setQueue(
                    rows.filter((entry) => entry.videoId !== row.videoId).length
                      ? [row, ...rows.filter((entry) => entry.videoId !== row.videoId)]
                      : [row],
                    0,
                  )
                }
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-center text-xs text-muted-foreground">{index + 1}</span>
                  <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {row.thumbnail ? (
                      <Image src={row.thumbnail} alt="" fill sizes="112px" className="object-cover" unoptimized />
                    ) : null}
                    {row.durationSeconds ? (
                      <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-white">
                        {formatDuration(row.durationSeconds)}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium">{row.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.channelName}</p>
                  </div>
                </div>
              </button>
              <Link href={`/watch?v=${row.videoId}`} className="rounded-full p-2 hover:bg-accent" aria-label="Open video">
                <Play className="size-4" />
              </Link>
              {isLocal ? (
                <button
                  type="button"
                  aria-label="Remove from playlist"
                  className="rounded-full p-2 text-muted-foreground hover:bg-accent"
                  onClick={() => localItems.remove(row.videoId)}
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
