"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { Headphones, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";

/**
 * Floating mini player.
 *
 * Playback lives in <AudioEngine>, so this component is pure UI: it never owns
 * media, which is why closing it cannot leave a zombie audio element behind.
 * The close button is a real stop (queue + playback + sheet), pushed apart from
 * the tap-to-open area so a dismissal can never navigate.
 */
export function MiniPlayer({ open }: { open: boolean }) {
  const queue = usePlayerStore((state) => state.queue);
  const index = usePlayerStore((state) => state.index);
  const playing = usePlayerStore((state) => state.playing);
  const miniOpen = usePlayerStore((state) => state.miniOpen);
  const audioOnly = usePlayerStore((state) => state.audioOnly);
  const positionSeconds = usePlayerStore((state) => state.positionSeconds);
  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const setMiniOpen = usePlayerStore((state) => state.setMiniOpen);
  const setAudioOnly = usePlayerStore((state) => state.setAudioOnly);
  const stopPlayback = usePlayerStore((state) => state.stopPlayback);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);

  const item = queue[index];
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number; onControl: boolean } | null>(null);

  if (!item) return null;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const onControl = Boolean((event.target as HTMLElement).closest("button, a"));
    start.current = { x: event.clientX, y: event.clientY, onControl };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.onControl) return;
    setDrag({ x: event.clientX - start.current.x, y: event.clientY - start.current.y });
  };
  const onPointerUp = () => {
    if (start.current && !start.current.onControl) {
      // Swipe down or flick sideways both mean "I'm done with this".
      if (drag.y > 56 || Math.abs(drag.x) > 96) stopPlayback();
    }
    setDrag({ x: 0, y: 0 });
    start.current = null;
  };

  const progress = item.durationSeconds
    ? Math.min(100, Math.max(0, (positionSeconds / item.durationSeconds) * 100))
    : 0;

  return (
    <>
      <div
        className={cn(
          "fixed inset-x-0 z-40 mx-2 transition-transform duration-200 md:inset-x-auto md:right-4 md:mx-0 md:w-[380px]",
          open ? "pointer-events-auto" : "pointer-events-none translate-y-4 opacity-0",
        )}
        style={{
          bottom: "calc(var(--nav-offset) + 0.5rem)",
          transform: `translate(${drag.x}px, ${drag.y}px)`,
        }}
        aria-hidden={!open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setDrag({ x: 0, y: 0 });
          start.current = null;
        }}
      >
        <div className="relative flex items-center gap-3 rounded-xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur">
          {/* Tap-to-open layer, kept beneath the controls. */}
          <Link
            href={`/watch?v=${item.videoId}`}
            aria-label={`Open ${item.title}`}
            className="absolute inset-0 z-0 rounded-xl"
            onClick={() => setMiniOpen(false)}
          />
          <div className="relative z-[1] aspect-video w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
            {item.thumbnail ? (
              <Image src={item.thumbnail} alt="" fill sizes="80px" className="object-cover" unoptimized />
            ) : null}
          </div>
          <div className="relative z-[1] min-w-0 flex-1">
            <p className="line-clamp-2-youtube text-[13px] font-medium leading-4">{item.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">{item.channelName}</p>
          </div>

          <div className="relative z-[2] flex items-center">
            <button
              type="button"
              aria-label="Previous track"
              className="hidden size-11 items-center justify-center rounded-full hover:bg-accent sm:flex"
              onClick={(event) => {
                event.stopPropagation();
                previous();
              }}
            >
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              className="flex size-11 items-center justify-center rounded-full hover:bg-accent"
              onClick={(event) => {
                event.stopPropagation();
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
            </button>
            <button
              type="button"
              aria-label="Next track"
              className="hidden size-11 items-center justify-center rounded-full hover:bg-accent sm:flex"
              onClick={(event) => {
                event.stopPropagation();
                next();
              }}
            >
              <SkipForward className="size-4" />
            </button>
            <button
              type="button"
              aria-label={audioOnly ? "Switch back to video" : "Audio only"}
              aria-pressed={audioOnly}
              className={cn("flex size-11 items-center justify-center rounded-full hover:bg-accent", audioOnly && "text-red-500")}
              onClick={(event) => {
                event.stopPropagation();
                setAudioOnly(!audioOnly);
              }}
            >
              <Headphones className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Stop and close mini player"
              className="relative z-[3] flex size-11 items-center justify-center rounded-full hover:bg-accent"
              onClick={(event) => {
                // Keep the tap away from the tap-to-open link underneath.
                event.preventDefault();
                event.stopPropagation();
                stopPlayback();
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
        <div className="mx-3 mt-0.5 h-0.5 rounded bg-muted">
          <div className="h-full rounded bg-red-600 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <Sheet open={miniOpen} onOpenChange={setMiniOpen} side="bottom" title="Now playing">
        <div className="space-y-4 pb-2">
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
          <div className="flex gap-2">
            <Link
              href={`/watch?v=${item.videoId}`}
              onClick={() => setMiniOpen(false)}
              className="flex-1 rounded-lg bg-secondary py-2 text-center text-sm font-medium"
            >
              Open full player
            </Link>
            <button
              type="button"
              onClick={stopPlayback}
              className="rounded-lg px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              Stop
            </button>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Queue</p>
            <div className="space-y-2">
              {queue.map((entry, entryIndex) => (
                <Link
                  key={`${entry.videoId}-${entryIndex}`}
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
