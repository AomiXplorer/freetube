"use client";

import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { fetchSearch } from "@/lib/api/client";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { ChannelCard } from "@/components/video/channel-card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";

const TYPES = [
  { value: "", label: "All" },
  { value: "video", label: "Videos" },
  { value: "channel", label: "Channels" },
  { value: "playlist", label: "Playlists" },
] as const;

const DURATIONS = [
  { value: "", label: "Any length" },
  { value: "short", label: "Under 4 min" },
  { value: "medium", label: "4-20 min" },
  { value: "long", label: "Over 20 min" },
] as const;

const SORTS = [
  { value: "", label: "Relevance" },
  { value: "date", label: "Upload date" },
  { value: "views", label: "View count" },
  { value: "rating", label: "Rating" },
] as const;

const DATES = [
  { value: "", label: "Any time" },
  { value: "hour", label: "Last hour" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
] as const;

export function SearchPage() {
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const [type, setType] = useState("");
  const [sort, setSort] = useState("");
  const [duration, setDuration] = useState("");
  const [uploadDate, setUploadDate] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const search = useInfiniteQuery({
    queryKey: ["search", query, type, sort, duration, uploadDate],
    queryFn: ({ pageParam }) =>
      fetchSearch({
        query,
        type: type || undefined,
        sort: sort || undefined,
        duration: duration || undefined,
        uploadDate: uploadDate || undefined,
        continuation: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.continuation,
    enabled: Boolean(query),
    staleTime: 60_000,
  });

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && search.hasNextPage && !search.isFetchingNextPage) {
        void search.fetchNextPage();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [search]);

  const videos = search.data?.pages.flatMap((page) => page.videos) ?? [];
  const channels = search.data?.pages.flatMap((page) => page.channels) ?? [];
  const playlists = search.data?.pages.flatMap((page) => page.playlists) ?? [];
  const activeFilterCount = [type, sort, duration, uploadDate].filter(Boolean).length;

  return (
    <div className="pb-10">
      <div className="sticky top-14 z-20 -mx-3 mb-4 flex items-center gap-2 overflow-x-auto bg-background/95 px-3 py-2 backdrop-blur scrollbar-none md:top-0 md:mx-0 md:px-0">
        <Button
          variant={activeFilterCount ? "default" : "secondary"}
          size="sm"
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal className="size-4" /> Filters
          {activeFilterCount ? ` (${activeFilterCount})` : ""}
        </Button>
        {TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setType(option.value)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
              type === option.value ? "bg-foreground text-background" : "bg-secondary hover:bg-accent",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {!query ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Search for videos, channels or playlists.
        </p>
      ) : search.isLoading ? (
        <VideoGridSkeleton count={8} />
      ) : search.isError ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">Search failed. Try again in a moment.</p>
          <Button className="mt-4" onClick={() => search.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {channels.length && (type === "" || type === "channel") ? (
            <section>
              <h2 className="mb-3 text-lg font-medium">Channels</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {channels.map((channel) => (
                  <ChannelCard key={channel.id ?? channel.name} channel={channel} />
                ))}
              </div>
            </section>
          ) : null}

          {playlists.length && (type === "" || type === "playlist") ? (
            <section>
              <h2 className="mb-3 text-lg font-medium">Playlists</h2>
              <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {playlists.map((playlist) => (
                  <Link
                    key={playlist.id}
                    href={`/playlist/${playlist.id}`}
                    className="block rounded-xl border border-border p-3 hover:bg-accent"
                  >
                    <p className="line-clamp-2 text-sm font-medium">{playlist.title}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {videos.length ? (
            <section>
              {type === "" ? <h2 className="mb-3 text-lg font-medium">Videos</h2> : null}
              <VideoGrid videos={videos} />
            </section>
          ) : channels.length === 0 && playlists.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No results for “{query}”.</p>
          ) : null}
        </div>
      )}

      <div ref={sentinel} className="h-8" />
      {search.isFetchingNextPage ? <VideoGridSkeleton count={4} /> : null}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} side="bottom" title="Search filters">
        <div className="space-y-5">
          {[
            { title: "Type", options: TYPES, value: type, setValue: setType },
            { title: "Sort by", options: SORTS, value: sort, setValue: setSort },
            { title: "Duration", options: DURATIONS, value: duration, setValue: setDuration },
            { title: "Upload date", options: DATES, value: uploadDate, setValue: setUploadDate },
          ].map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-sm font-medium">{group.title}</p>
              <div className="flex flex-wrap gap-2">
                {group.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => group.setValue(option.value)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm",
                      group.value === option.value
                        ? "bg-foreground text-background"
                        : "bg-secondary hover:bg-accent",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Button className="w-full" onClick={() => setFiltersOpen(false)}>
            Show results
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
