import { Suspense } from "react";
import type { Metadata } from "next";
import { LibraryPage } from "@/components/library/library-page";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Library" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <LibraryPage />
    </Suspense>
  );
}
