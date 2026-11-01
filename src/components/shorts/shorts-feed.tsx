"use client";

import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Heart, MessageCircle, Share2, ThumbsUp } from "lucide-react";
import { fetchSearch } from "@/lib/api/client";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { bestThumb, formatDuration } from "@/lib/utils/format";

/**
 * Shorts viewer: vertical snap scrolling, only the visible item loads an embed.
 * Shorts are the most aggressively bot-gated YouTube surface, so playback uses
 * the official no-cookie embed and always works, even on hosts that cannot get
 * native streams.
 */
export function ShortsFeed() {
  const params = useSearchParams();
  const initial = params.get("v");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["shorts"],
    queryFn: ({ pageParam }) =>
      fetchSearch({
        query: "#shorts",
        type: "video",
        duration: "short",
        continuation: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.continuation,
    staleTime: 300_000,
  });

  const shorts = (data?.pages.flatMap((page) => page.videos) ?? []).filter(
    (video) => (video.durationSeconds ?? 0) <= 90 || video.kind === "short",
  );

  useEffect(() => {
    if (initial && shorts.length) {
      const index = shorts.findIndex((video) => video.id === initial);
      if (index >= 0) {
        setActiveIndex(index);
        containerRef.current?.scrollTo({ top: index * window.innerHeight });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, shorts.length]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center bg-black">
        <Skeleton className="h-[80vh] w-[min(420px,100%)] rounded-2xl" />
      </div>
    );
  }

  if (!shorts.length) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col items-center justify-center gap-2 bg-black text-white">
        <p className="text-lg font-medium">No Shorts right now</p>
        <p className="text-sm text-white/60">YouTube returned no short videos for this network.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[calc(100dvh-3.5rem)] snap-y snap-mandatory overflow-y-scroll bg-black scrollbar-none"
      onScroll={(event) => {
        const element = event.currentTarget;
        const index = Math.round(element.scrollTop / element.clientHeight);
        if (index !== activeIndex) setActiveIndex(index);
        const nearEnd = element.scrollTop + element.clientHeight * 2 > element.scrollHeight;
        if (nearEnd && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      }}
    >
      {shorts.map((short, index) => (
        <section
          key={short.id}
          className="relative flex h-full snap-start snap-always items-center justify-center"
          aria-label={short.title}
        >
          <div className="relative h-full w-full max-w-[520px] overflow-hidden bg-black">
            {Math.abs(index - activeIndex) <= 1 ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${short.id}?autoplay=${index === activeIndex ? 1 : 0}&loop=1&playlist=${short.id}&playsinline=1&modestbranding=1&controls=0`}
                title={short.title}
                className="absolute inset-0 size-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bestThumb(short.thumbnails) ?? ""}
                alt=""
                className="absolute inset-0 size-full object-cover opacity-70"
              />
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pb-24 text-white">
              <div className="flex items-center gap-2">
                <Avatar src={bestThumb(short.channel.avatar)} name={short.channel.name} size={32} />
                <span className="text-sm font-medium">{short.channel.name}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm">{short.title}</p>
              <p className="mt-1 text-xs text-white/70">
                {[short.viewCountText, formatDuration(short.durationSeconds)].filter(Boolean).join(" · ")}
              </p>
            </div>

            <div className="absolute bottom-24 right-2 flex flex-col items-center gap-4 text-white">
              {[
                { icon: ThumbsUp, label: "Like" },
                { icon: MessageCircle, label: "Comments" },
                { icon: Share2, label: "Share" },
                { icon: Heart, label: "Save" },
              ].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  aria-label={action.label}
                  className="flex flex-col items-center gap-1 rounded-full p-2 hover:bg-white/10"
                >
                  <action.icon className="size-6" />
                </button>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
