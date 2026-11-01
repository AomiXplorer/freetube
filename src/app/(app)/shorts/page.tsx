import { Suspense } from "react";
import type { Metadata } from "next";
import { ShortsFeed } from "@/components/shorts/shorts-feed";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Shorts" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[calc(100dvh-3.5rem)] w-full rounded-none" />}>
      <ShortsFeed />
    </Suspense>
  );
}
