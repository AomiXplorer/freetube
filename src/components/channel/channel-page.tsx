"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Bell, ChevronDown, ChevronUp } from "lucide-react";
import { fetchChannel } from "@/lib/api/client";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { bestThumb } from "@/lib/utils/format";
import { useSubscription } from "@/db/hooks";

export function ChannelPage() {
  const routeParams = useParams<{ id: string }>();
  const channelId = routeParams?.id ?? "";
  const [tabParams, setTabParams] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState("Home");
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["channel", channelId, tabParams],
    queryFn: () => fetchChannel(channelId, tabParams),
    enabled: Boolean(channelId),
    staleTime: 300_000,
  });

  const { subscribed, toggle } = useSubscription(channelId);

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl md:h-48" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <VideoGridSkeleton count={8} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-lg font-medium">Channel unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          YouTube did not return this channel. It may be age restricted or region blocked.
        </p>
      </div>
    );
  }

  const banner = bestThumb(data.banner);
  const tabs = data.tabs.length ? data.tabs : [{ title: "Home", params: undefined }];

  return (
    <div className="pb-10">
      {banner ? (
        <div className="relative -mx-3 aspect-[6/1] w-[calc(100%+1.5rem)] overflow-hidden md:mx-0 md:w-full md:rounded-xl">
          <Image src={banner} alt="" fill sizes="100vw" className="object-cover" unoptimized priority />
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar src={bestThumb(data.avatar)} name={data.title} size={96} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">{data.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[data.handle, data.subscribers, data.videoCountText].filter(Boolean).join(" · ")}
          </p>
          {data.description ? (
            <div className="mt-1 max-w-2xl">
              <p className={`whitespace-pre-wrap text-sm text-muted-foreground ${descriptionOpen ? "" : "line-clamp-2"}`}>
                {data.description}
              </p>
              {data.description.length > 120 ? (
                <button
                  type="button"
                  className="mt-1 flex items-center gap-1 text-xs font-medium"
                  onClick={() => setDescriptionOpen((value) => !value)}
                >
                  {descriptionOpen ? "Show less" : "More about this channel"}
                  {descriptionOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <Button
          variant={subscribed ? "subscribed" : "subscribe"}
          onClick={() => toggle({ channelId, name: data.title, avatar: bestThumb(data.avatar) })}
        >
          {subscribed ? (
            <>
              <Bell className="size-4" /> Subscribed
            </>
          ) : (
            "Subscribe"
          )}
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          const tab = tabs.find((entry) => entry.title === value);
          setTabParams(tab?.params);
        }}
        className="mt-6"
      >
        <TabsList className="border-b border-border pb-2">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.title} value={tab.title}>
              {tab.title}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {activeTab.toLowerCase().includes("playlist") && data.playlists.length ? (
            <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {data.playlists.map((playlist) => (
                <Link
                  key={playlist.id}
                  href={`/playlist/${playlist.id}`}
                  className="rounded-xl border border-border p-3 hover:bg-accent"
                >
                  <p className="line-clamp-2 text-sm font-medium">{playlist.title}</p>
                </Link>
              ))}
            </div>
          ) : activeTab.toLowerCase().includes("short") && data.shorts.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {data.shorts.map((short) => (
                <Link key={short.id} href={`/shorts?v=${short.id}`} className="block">
                  <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-muted">
                    <Image
                      src={bestThumb(short.thumbnails) ?? ""}
                      alt={short.title}
                      fill
                      sizes="200px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs">{short.title}</p>
                </Link>
              ))}
            </div>
          ) : data.videos.length ? (
            <VideoGrid videos={data.videos} />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              This tab is empty or requires a signed-in session.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
