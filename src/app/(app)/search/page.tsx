import { Suspense } from "react";
import type { Metadata } from "next";
import { SearchPage } from "@/components/search/search-page";
import { VideoGridSkeleton } from "@/components/video/video-grid";

export const metadata: Metadata = { title: "Search" };

export default function Page() {
  return (
    <Suspense fallback={<VideoGridSkeleton count={8} />}>
      <SearchPage />
    </Suspense>
  );
}
