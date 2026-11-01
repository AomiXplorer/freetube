"use client";

import Image from "next/image";
import Link from "next/link";
import { memo } from "react";
import type { VideoSummary } from "@/lib/innertube/types";
import { bestThumb, formatDuration } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

function VideoCardBase({
  video,
  layout = "grid",
  className,
}: {
  video: VideoSummary;
  layout?: "grid" | "row" | "compact";
  className?: string;
}) {
  const thumb = bestThumb(video.thumbnails) ?? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
  const href = `/watch?v=${video.id}`;

  if (layout === "compact") {
    return (
      <Link href={href} className={cn("group flex gap-2", className)}>
        <div className="relative aspect-video w-[168px] shrink-0 overflow-hidden rounded-lg bg-muted">
          <Image src={thumb} alt="" fill sizes="168px" className="object-cover" unoptimized />
          {video.durationText ? (
            <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] font-medium text-white">
              {formatDuration(video.durationSeconds) || video.durationText}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2-youtube text-sm font-medium leading-5">{video.title}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{video.channel.name}</p>
          <p className="text-xs text-muted-foreground">
            {[video.viewCountText, video.publishedText].filter(Boolean).join(" · ")}
          </p>
        </div>
      </Link>
    );
  }

  if (layout === "row") {
    return (
      <Link href={href} className={cn("group flex gap-3", className)}>
        <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-muted">
          <Image src={thumb} alt="" fill sizes="160px" className="object-cover" unoptimized />
          {video.durationText ? (
            <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] font-medium text-white">
              {formatDuration(video.durationSeconds) || video.durationText}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="line-clamp-2-youtube text-sm font-medium leading-5">{video.title}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{video.channel.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[video.viewCountText, video.publishedText].filter(Boolean).join(" · ")}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className={cn("group flex flex-col gap-2", className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
        <Image
          src={thumb}
          alt={video.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          unoptimized
        />
        {video.kind === "live" ? (
          <span className="absolute bottom-1.5 right-1.5">
            <Badge variant="live">Live</Badge>
          </span>
        ) : video.durationText || video.durationSeconds ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 py-0.5 text-[11px] font-medium text-white">
            {formatDuration(video.durationSeconds) || video.durationText}
          </span>
        ) : null}
        {video.kind === "upcoming" ? (
          <span className="absolute bottom-1.5 right-1.5">
            <Badge variant="muted">Upcoming</Badge>
          </span>
        ) : null}
      </div>
      <div className="flex gap-3">
        {video.channel.avatar?.length ? (
          <Avatar src={bestThumb(video.channel.avatar)} name={video.channel.name} size={36} className="mt-0.5" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2-youtube text-[15px] font-medium leading-5">{video.title}</h3>
          <p className="mt-1 truncate text-[13px] text-muted-foreground hover:text-foreground">
            {video.channel.name}
          </p>
          <p className="truncate text-[13px] text-muted-foreground">
            {[video.viewCountText, video.publishedText].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
    </Link>
  );
}

export const VideoCard = memo(VideoCardBase);
