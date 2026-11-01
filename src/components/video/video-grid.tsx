"use client";

import type { VideoSummary } from "@/lib/innertube/types";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoCard } from "./video-card";

export function VideoGrid({
  videos,
  layout = "grid",
  className,
}: {
  videos: VideoSummary[];
  layout?: "grid" | "row" | "compact";
  className?: string;
}) {
  if (layout !== "grid") {
    return (
      <div className="flex flex-col gap-3">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} layout={layout} />
        ))}
      </div>
    );
  }
  return (
    <div
      className={
        className ??
        "grid grid-cols-1 gap-x-4 gap-y-8 xs:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5"
      }
    >
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}

export function VideoCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="aspect-video w-full rounded-xl" />
      <div className="flex gap-3">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-[92%]" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}

export function VideoGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-8 xs:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <VideoCardSkeleton key={index} />
      ))}
    </div>
  );
}
