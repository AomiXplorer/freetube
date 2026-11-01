import { Suspense } from "react";
import type { Metadata } from "next";
import { WatchPage } from "@/components/watch/watch-page";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Watch" };

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      }
    >
      <WatchPage />
    </Suspense>
  );
}
