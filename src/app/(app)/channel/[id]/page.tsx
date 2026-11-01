import { Suspense } from "react";
import { ChannelPage } from "@/components/channel/channel-page";
import { VideoGridSkeleton } from "@/components/video/video-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <VideoGridSkeleton count={8} />
        </div>
      }
    >
      <ChannelPage />
    </Suspense>
  );
}
