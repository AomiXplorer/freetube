"use client";

import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchHome } from "@/lib/api/client";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { ChipBar } from "@/components/video/chip-bar";
import { Button } from "@/components/ui/button";
import type { CategoryChip } from "@/lib/innertube/types";

export function HomeFeed() {
  const [chip, setChip] = useState<CategoryChip | undefined>();
  const sentinel = useRef<HTMLDivElement>(null);

  const query = useInfiniteQuery({
    queryKey: ["home", chip?.params ?? "default"],
    queryFn: ({ pageParam }) => fetchHome(chip?.params ?? undefined, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.continuation,
    staleTime: 120_000,
    retry: 1,
  });

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [query]);

  const firstPage = query.data?.pages[0];
  const chips = firstPage?.chips ?? [];
  const sections = query.data?.pages.flatMap((page) => page.sections) ?? [];

  return (
    <div className="pb-6">
      <ChipBar chips={chips} active={chip?.title} onSelect={(next) => setChip(next)} />

      {query.isLoading ? (
        <VideoGridSkeleton count={12} />
      ) : query.isError ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Could not load the feed. YouTube may be rate-limiting this network.
          </p>
          <Button className="mt-4" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {firstPage?.fallback ? (
            <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
              Showing a public feed because your YouTube home feed needs an account. Connect cookies
              in Settings for a personalised feed.
            </p>
          ) : null}
          {sections.map((section, index) => (
            <section key={`${section.title ?? "section"}-${index}`}>
              {section.title ? <h2 className="mb-3 text-lg font-medium">{section.title}</h2> : null}
              <VideoGrid videos={section.items} />
            </section>
          ))}
        </div>
      )}

      <div ref={sentinel} className="h-8" />
      {query.isFetchingNextPage ? <VideoGridSkeleton count={4} /> : null}
    </div>
  );
}
