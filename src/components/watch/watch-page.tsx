"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Bookmark,
  ChevronDown,
  ChevronUp,
  ListPlus,
  Share2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { fetchVideo, type VideoBundle } from "@/lib/api/client";
import { VideoPlayer } from "@/components/player/video-player";
import { VideoCard } from "@/components/video/video-card";
import { Comments } from "@/components/watch/comments";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dropdown, DropdownItem, DropdownLabel } from "@/components/ui/dropdown";
import { Sheet } from "@/components/ui/sheet";
import { bestThumb, formatDuration } from "@/lib/utils/format";
import { usePlayerStore } from "@/store/player";
import { useAddToPlaylist, useHistory, usePlaylists, useSubscription } from "@/db/hooks";
import { db, LIKED_ID, WATCH_LATER_ID } from "@/db";
import { cn } from "@/lib/utils/cn";

export function WatchPage() {
  const params = useSearchParams();
  const router = useRouter();
  const videoId = params.get("v") ?? "";
  const startAt = Number(params.get("t") ?? 0);

  const [theater, setTheater] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const enqueue = usePlayerStore((state) => state.enqueue);
  const { entries } = useHistory(100);
  const { playlists, create } = usePlaylists();
  const addToPlaylist = useAddToPlaylist();
  const [liked, setLiked] = useState(false);

  const { data, isLoading, isError, error } = useQuery<VideoBundle>({
    queryKey: ["video", videoId],
    queryFn: () => fetchVideo(videoId),
    enabled: /^[\w-]{11}$/.test(videoId),
    staleTime: 90_000,
    retry: 0,
  });

  const details = data?.details;
  const { subscribed, toggle } = useSubscription(details?.channel.id);

  const resumeAt = useMemo(() => {
    if (startAt > 0) return startAt;
    const entry = entries.find((item) => item.videoId === videoId);
    return entry?.positionSeconds && entry.positionSeconds > 5 ? entry.positionSeconds : 0;
  }, [entries, videoId, startAt]);

  useEffect(() => {
    if (!details) return;
    setQueue(
      [
        {
          videoId: details.id,
          title: details.title,
          channelName: details.channel.name,
          thumbnail: bestThumb(details.thumbnails),
          durationSeconds: details.durationSeconds,
        },
        ...(data?.related ?? []).map((video) => ({
          videoId: video.id,
          title: video.title,
          channelName: video.channel.name,
          thumbnail: bestThumb(video.thumbnails),
          durationSeconds: video.durationSeconds,
        })),
      ],
      0,
    );
    void db().history.put({
      videoId: details.id,
      title: details.title,
      channelName: details.channel.name,
      channelId: details.channel.id,
      thumbnail: bestThumb(details.thumbnails),
      durationSeconds: details.durationSeconds,
      watchedAt: Date.now(),
      positionSeconds: resumeAt,
    });
  }, [details, data?.related, resumeAt, setQueue]);

  useEffect(() => {
    if (!details) return;
    const timer = setInterval(() => {
      void db().history.update(details.id, { watchedAt: Date.now() });
    }, 60_000);
    return () => clearInterval(timer);
  }, [details]);

  if (!videoId || isError) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-xl font-medium">This video is not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {(error as Error | null)?.message ?? "The video may be private, removed, or region locked."}
        </p>
        <Button className="mt-6" onClick={() => router.push("/")}>
          Back to home
        </Button>
      </div>
    );
  }

  if (isLoading || !details) {
    return (
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="w-full space-y-3 lg:w-[380px]">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto w-full max-w-[1750px]", theater && "max-w-none")}>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className={cn("min-w-0 flex-1", theater && "lg:flex-none lg:basis-full")}>
          <VideoPlayer
            details={details}
            streams={data.streams}
            startAt={resumeAt}
            theater={theater}
            onTheaterChange={setTheater}
          />

          {!details.playable ? (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">Native playback unavailable</p>
              <p className="mt-1 text-muted-foreground">
                {details.playabilityReason ??
                  "YouTube refused the stream request (bot check or signed-out limit). The embedded player above is used instead."}
              </p>
            </div>
          ) : null}

          <h1 className="mt-4 text-lg font-medium leading-6 md:text-xl">{details.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href={details.channel.id ? `/channel/${details.channel.id}` : "#"} className="flex items-center gap-3">
              <Avatar src={bestThumb(details.channel.avatar)} name={details.channel.name} size={40} />
              <div>
                <p className="text-sm font-medium">{details.channel.name}</p>
                <p className="text-xs text-muted-foreground">{details.channel.subscribers}</p>
              </div>
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={() =>
                  toggle({
                    channelId: details.channel.id ?? "",
                    name: details.channel.name,
                    avatar: bestThumb(details.channel.avatar),
                  })
                }
                disabled={!details.channel.id}
              >
                {subscribed ? (
                  <>
                    <Bell className="size-4" /> Subscribed
                  </>
                ) : (
                  "Subscribe"
                )}
              </Button>

              <div className="flex items-center overflow-hidden rounded-full bg-secondary">
                <button
                  type="button"
                  onClick={() => setLiked((value) => !value)}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent"
                >
                  <ThumbsUp className={cn("size-4", liked && "fill-current")} />
                  {details.likeCountText ?? "Like"}
                </button>
                <span className="h-6 w-px bg-border" />
                <button type="button" className="px-3 py-2 hover:bg-accent" aria-label="Dislike">
                  <ThumbsDown className="size-4" />
                </button>
              </div>

              <Button variant="secondary" className="rounded-full" onClick={() => setSaveOpen(true)}>
                <Bookmark className="size-4" /> Save
              </Button>
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={async () => {
                  const url = `${window.location.origin}/watch?v=${details.id}`;
                  if (navigator.share) {
                    await navigator.share({ title: details.title, url }).catch(() => undefined);
                  } else {
                    await navigator.clipboard.writeText(url).catch(() => undefined);
                  }
                }}
              >
                <Share2 className="size-4" /> Share
              </Button>
              <Dropdown
                trigger={
                  <Button variant="secondary" className="rounded-full">
                    <ListPlus className="size-4" /> Queue
                  </Button>
                }
              >
                <DropdownLabel>Queue</DropdownLabel>
                <DropdownItem
                  onSelect={() =>
                    enqueue(
                      {
                        videoId: details.id,
                        title: details.title,
                        channelName: details.channel.name,
                        thumbnail: bestThumb(details.thumbnails),
                        durationSeconds: details.durationSeconds,
                      },
                      true,
                    )
                  }
                >
                  Play next
                </DropdownItem>
                <DropdownItem
                  onSelect={() =>
                    enqueue({
                      videoId: details.id,
                      title: details.title,
                      channelName: details.channel.name,
                      thumbnail: bestThumb(details.thumbnails),
                      durationSeconds: details.durationSeconds,
                    })
                  }
                >
                  Add to end of queue
                </DropdownItem>
              </Dropdown>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-secondary/70 p-3">
            <div className="flex flex-wrap gap-2 text-sm font-medium">
              <span>{details.viewCountText ?? (details.views ? `${details.views.toLocaleString()} views` : "")}</span>
              {details.publishedText ? <span>{details.publishedText}</span> : null}
              {details.isLive ? <Badge variant="live">Live</Badge> : null}
              {details.isAgeRestricted ? <Badge variant="muted">Age restricted</Badge> : null}
            </div>

            {details.chapters.length ? (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Chapters</p>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {details.chapters.map((chapter) => (
                    <li key={`${chapter.startSeconds}-${chapter.title}`}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[13px] hover:bg-accent"
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent("freetube:seek", { detail: { seconds: chapter.startSeconds } }),
                          )
                        }
                      >
                        <span className="tabular-nums text-muted-foreground">
                          {formatDuration(chapter.startSeconds)}
                        </span>
                        <span className="truncate">{chapter.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p
              className={cn(
                "mt-3 whitespace-pre-wrap text-sm leading-5",
                !expanded && "line-clamp-3 text-foreground/90",
              )}
            >
              {details.description || "No description."}
            </p>
            {details.description && details.description.length > 160 ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="mt-2 flex items-center gap-1 text-sm font-medium"
              >
                {expanded ? (
                  <>
                    Show less <ChevronUp className="size-4" />
                  </>
                ) : (
                  <>
                    Show more <ChevronDown className="size-4" />
                  </>
                )}
              </button>
            ) : null}
          </div>

          <Comments continuation={data.commentsContinuation} />
        </div>

        <aside className={cn("w-full shrink-0 space-y-3 lg:w-[380px]", theater && "lg:w-full")}>
          <p className="text-sm font-medium">Up next</p>
          {data.related.map((video) => (
            <div key={video.id} className="flex gap-2">
              <VideoCard video={video} layout="compact" />
            </div>
          ))}
        </aside>
      </div>

      <Sheet open={saveOpen} onOpenChange={setSaveOpen} side="bottom" title="Save video">
        <div className="space-y-1">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
            onClick={async () => {
              await addToPlaylist(WATCH_LATER_ID, {
                videoId: details.id,
                title: details.title,
                channelName: details.channel.name,
                thumbnail: bestThumb(details.thumbnails),
                durationSeconds: details.durationSeconds,
              });
              setSaveOpen(false);
            }}
          >
            <Bookmark className="size-4" /> Watch later
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
            onClick={async () => {
              await addToPlaylist(LIKED_ID, {
                videoId: details.id,
                title: details.title,
                channelName: details.channel.name,
                thumbnail: bestThumb(details.thumbnails),
                durationSeconds: details.durationSeconds,
              });
              setSaveOpen(false);
            }}
          >
            <ThumbsUp className="size-4" /> Liked videos
          </button>
          <div className="my-2 border-t border-border" />
          {playlists
            .filter((playlist) => !playlist.system)
            .map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={async () => {
                  await addToPlaylist(playlist.id, {
                    videoId: details.id,
                    title: details.title,
                    channelName: details.channel.name,
                    thumbnail: bestThumb(details.thumbnails),
                    durationSeconds: details.durationSeconds,
                  });
                  setSaveOpen(false);
                }}
              >
                <ListPlus className="size-4" /> {playlist.name}
              </button>
            ))}
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
            onClick={async () => {
              const name = window.prompt("Playlist name");
              if (!name?.trim()) return;
              await create(name.trim());
            }}
          >
            + New playlist
          </button>
        </div>
      </Sheet>
    </div>
  );
}
