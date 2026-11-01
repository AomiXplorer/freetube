"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Clock, ListVideo, Plus, ThumbsUp, Trash2 } from "lucide-react";
import { useHistory, usePlaylists, useSubscriptions } from "@/db/hooks";
import { LIKED_ID } from "@/db";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { formatDuration, timeAgo } from "@/lib/utils/format";

export function LibraryPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "playlists" ? "playlists" : "history");
  const { entries, clear, remove } = useHistory(50);
  const { playlists, create } = usePlaylists();
  const { subscriptions } = useSubscriptions();

  const systemPlaylists = playlists.filter((playlist) => playlist.system);
  const userPlaylists = playlists.filter((playlist) => !playlist.system);

  return (
    <div className="pb-10">
      <h1 className="mb-4 text-xl font-bold">You</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 border-b border-border pb-2">
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="playlists">Playlists</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-medium">Watch history</h2>
            {entries.length ? (
              <Button variant="ghost" size="sm" onClick={() => clear()}>
                <Trash2 className="size-4" /> Clear
              </Button>
            ) : null}
          </div>
          {!entries.length ? (
            <p className="py-10 text-sm text-muted-foreground">
              Videos you watch are stored on this device and appear here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((entry) => (
                <li key={entry.videoId} className="flex items-center gap-3 py-3">
                  <Link href={`/watch?v=${entry.videoId}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {entry.thumbnail ? (
                        <Image src={entry.thumbnail} alt="" fill sizes="128px" className="object-cover" unoptimized />
                      ) : null}
                      {entry.durationSeconds ? (
                        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-white">
                          {formatDuration(entry.durationSeconds)}
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium">{entry.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{entry.channelName}</p>
                      <p className="text-xs text-muted-foreground">
                        {timeAgo(new Date(entry.watchedAt).toISOString())}
                        {entry.positionSeconds
                          ? ` · resume at ${formatDuration(entry.positionSeconds)}`
                          : ""}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    aria-label="Remove from history"
                    className="rounded-full p-2 text-muted-foreground hover:bg-accent"
                    onClick={() => remove(entry.videoId)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="playlists">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {systemPlaylists.map((playlist) => (
              <Link
                key={playlist.id}
                href={`/playlist/${playlist.id}`}
                className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-accent"
              >
                {playlist.id === LIKED_ID ? <ThumbsUp className="size-5" /> : <Clock className="size-5" />}
                <span className="text-sm font-medium">{playlist.name}</span>
              </Link>
            ))}
            {userPlaylists.map((playlist) => (
              <Link
                key={playlist.id}
                href={`/playlist/${playlist.id}`}
                className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-accent"
              >
                <ListVideo className="size-5" />
                <span className="truncate text-sm font-medium">{playlist.name}</span>
              </Link>
            ))}
            <button
              type="button"
              className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3 text-left text-sm text-muted-foreground hover:bg-accent"
              onClick={async () => {
                const name = window.prompt("Playlist name");
                if (name?.trim()) await create(name.trim());
              }}
            >
              <Plus className="size-5" /> New playlist
            </button>
          </div>
        </TabsContent>

        <TabsContent value="subscriptions">
          {!subscriptions.length ? (
            <p className="py-10 text-sm text-muted-foreground">
              Channels you subscribe to appear here. Also see{" "}
              <Link href="/subscriptions" className="underline">
                your subscriptions feed
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {subscriptions.map((subscription) => (
                <Link
                  key={subscription.channelId}
                  href={`/channel/${subscription.channelId}`}
                  className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-accent"
                >
                  <Avatar src={subscription.avatar} name={subscription.name} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{subscription.name}</p>
                    <p className="text-xs text-muted-foreground">
                      since {new Date(subscription.subscribedAt).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
