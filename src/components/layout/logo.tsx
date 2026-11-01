import Link from "next/link";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-1.5", className)} aria-label="Freetube home">
      <span className="flex size-7 items-center justify-center rounded-md bg-[#ff0033]">
        <Play className="size-4 fill-white text-white" />
      </span>
      {!compact ? (
        <span className="text-[19px] font-bold tracking-tight">
          Free<span className="font-normal">tube</span>
        </span>
      ) : null}
    </Link>
  );
}
