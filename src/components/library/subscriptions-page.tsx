"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchChannel } from "@/lib/api/client";
import { useSubscriptions } from "@/db/hooks";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { mergeVideos as mergeVideoLists } from "@/lib/innertube/parse/walk";

export function SubscriptionsPage() {
  const { subscriptions } = useSubscriptions();
  const channelIds = subscriptions.slice(0, 6).map((subscription) => subscription.channelId);

  const latest = useQuery({
    queryKey: ["subscriptions-latest", channelIds.join(",")],
    queryFn: async () => {
      const pages = await Promise.all(
        channelIds.map((id) => fetchChannel(id).catch(() => null)),
      );
      return mergeVideoLists(
        ...pages.filter(Boolean).map((page) => page?.videos ?? []),
      ).slice(0, 36);
    },
    enabled: channelIds.length > 0,
    staleTime: 300_000,
  });

  if (!subscriptions.length) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-lg font-medium">No subscriptions yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Subscriptions are stored on this device only. Subscribe to a channel and it shows up here.
        </p>
        <Button className="mt-5" onClick={() => (window.location.href = "/")}>
          Find channels
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <section>
        <h1 className="mb-4 text-xl font-bold">Subscriptions</h1>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
          {subscriptions.map((subscription) => (
            <Link
              key={subscription.channelId}
              href={`/channel/${subscription.channelId}`}
              className="flex w-20 shrink-0 flex-col items-center gap-2 text-center"
            >
              <Avatar src={subscription.avatar} name={subscription.name} size={64} />
              <span className="line-clamp-2 text-[11px] text-muted-foreground">{subscription.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Latest from your channels</h2>
        {latest.isLoading ? (
          <VideoGridSkeleton count={8} />
        ) : latest.isError ? (
          <p className="text-sm text-muted-foreground">Could not load the latest videos.</p>
        ) : latest.data?.length ? (
          <VideoGrid videos={latest.data} />
        ) : (
          <p className="text-sm text-muted-foreground">Nothing new right now.</p>
        )}
      </section>
    </div>
  );
}
