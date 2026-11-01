"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { Pause, Play, SkipForward, X, Maximize2 } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";

/**
 * Persistent mini player. On mobile it can be swiped horizontally to dismiss
 * and tapped to expand into a bottom sheet, matching the native apps.
 */
export function MiniPlayer() {
  const { queue, index, playing, miniOpen, setPlaying, next, setMiniOpen, removeFromQueue } = usePlayerStore();
  const item = queue[index];
  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);

  if (!item) return null;

  const onPointerDown = (event: React.PointerEvent) => {
    startX.current = event.clientX;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (startX.current == null) return;
    setDragX(event.clientX - startX.current);
  };
  const onPointerUp = () => {
    if (Math.abs(dragX) > 80) {
      removeFromQueue(item.videoId);
    }
    setDragX(0);
    startX.current = null;
  };

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-[calc(var(--safe-bottom)+56px)] z-40 mx-2 mb-1 md:bottom-3 md:left-auto md:right-4 md:mx-0 md:w-[360px]"
        style={{ transform: `translateX(${dragX}px)`, transition: dragX ? "none" : "transform .18s ease" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur">
          <Link href={`/watch?v=${item.videoId}`} className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
            {item.thumbnail ? (
              <Image src={item.thumbnail} alt="" fill sizes="96px" className="object-cover" unoptimized />
            ) : null}
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/watch?v=${item.videoId}`} className="line-clamp-2-youtube text-[13px] font-medium leading-4">
              {item.title}
            </Link>
            <p className="truncate text-[11px] text-muted-foreground">{item.channelName}</p>
          </div>
          <div className="flex items-center">
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              className="rounded-full p-2 hover:bg-accent"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button
              type="button"
              aria-label="Next video"
              className="hidden rounded-full p-2 hover:bg-accent sm:block"
              onClick={next}
            >
              <SkipForward className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Expand player"
              className="rounded-full p-2 hover:bg-accent"
              onClick={() => setMiniOpen(true)}
            >
              <Maximize2 className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Close mini player"
              className="rounded-full p-2 hover:bg-accent"
              onClick={() => removeFromQueue(item.videoId)}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="mx-3 mt-0.5 h-0.5 rounded bg-muted">
          <div className={cn("h-full rounded bg-red-600", playing ? "animate-pulse" : "")} style={{ width: playing ? "100%" : "0%" }} />
        </div>
      </div>

      <Sheet open={miniOpen} onOpenChange={setMiniOpen} side="bottom" title="Now playing">
        <div className="space-y-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
            {item.thumbnail ? (
              <Image src={item.thumbnail} alt="" fill sizes="100vw" className="object-cover opacity-90" unoptimized />
            ) : null}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <button
                type="button"
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => setPlaying(!playing)}
                className="flex size-14 items-center justify-center rounded-full bg-white/90 text-black"
              >
                {playing ? <Pause className="size-6" /> : <Play className="size-6" />}
              </button>
            </div>
          </div>
          <div>
            <p className="font-medium">{item.title}</p>
            <p className="text-sm text-muted-foreground">{item.channelName}</p>
          </div>
          <Link
            href={`/watch?v=${item.videoId}`}
            onClick={() => setMiniOpen(false)}
            className="block rounded-lg bg-secondary py-2 text-center text-sm font-medium"
          >
            Open full player
          </Link>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Queue</p>
            <div className="space-y-2">
              {queue.map((entry, entryIndex) => (
                <Link
                  key={entry.videoId}
                  href={`/watch?v=${entry.videoId}`}
                  onClick={() => setMiniOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-accent",
                    entryIndex === index && "bg-accent",
                  )}
                >
                  <span className="w-4 text-center text-xs text-muted-foreground">{entryIndex + 1}</span>
                  <span className="line-clamp-1 flex-1">{entry.title}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Sheet>
    </>
  );
}
