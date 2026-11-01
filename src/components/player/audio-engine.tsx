"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { usePlayerStore } from "@/store/player";
import type { StreamInfo, VideoStreamFormat } from "@/lib/innertube/types";

type StreamResponse = {
  playable: boolean;
  reason?: string;
  streams: StreamInfo | null;
};

/** Audio-only track first (cheapest, keeps playing with the screen off), else muxed. */
function pickAudioSource(streams: StreamInfo | null): string | null {
  if (!streams) return null;
  const audioOnly = streams.formats
    .filter((format: VideoStreamFormat) => format.hasAudio && !format.hasVideo && format.url)
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
  if (audioOnly?.url) return audioOnly.url;
  const muxed = streams.formats
    .filter((format: VideoStreamFormat) => format.hasAudio && format.url)
    .sort((a, b) => (a.height ?? 0) - (b.height ?? 0))[0];
  return muxed?.url ?? null;
}

/**
 * One global <audio> element that owns playback outside the watch page.
 *
 * This is what makes the mini player real: navigating away from a video keeps a
 * single audio element alive, so the queue keeps advancing, the lock screen
 * controls keep working and nothing restarts on navigation. The watch page owns
 * playback itself while it is mounted.
 */
export function AudioEngine() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement>(null);
  const onWatch = pathname.startsWith("/watch") || pathname.startsWith("/shorts");

  const queue = usePlayerStore((state) => state.queue);
  const index = usePlayerStore((state) => state.index);
  const playing = usePlayerStore((state) => state.playing);
  const volume = usePlayerStore((state) => state.volume);
  const muted = usePlayerStore((state) => state.muted);
  const rate = usePlayerStore((state) => state.rate);
  const audioOnly = usePlayerStore((state) => state.audioOnly);
  const stopToken = usePlayerStore((state) => state.stopToken);
  const positionSeconds = usePlayerStore((state) => state.positionSeconds);
  const setPosition = usePlayerStore((state) => state.setPosition);
  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);

  const item = queue[index];
  const active = Boolean(item) && playing && (!onWatch || audioOnly);

  /* load a source whenever the track changes */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !item) {
      audio?.removeAttribute("src");
      audio?.load();
      return;
    }
    const controller = new AbortController();
    fetch(`/api/stream/${item.videoId}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<StreamResponse>) : null))
      .then((data) => {
        const source = pickAudioSource(data?.streams ?? null);
        if (!source || !audioRef.current) return;
        audioRef.current.src = source;
        audioRef.current.currentTime = usePlayerStore.getState().positionSeconds;
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [item, stopToken]);

  /* play/pause follows the store - never the page visibility */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
    audio.playbackRate = rate;
    if (active && audio.src) {
      const drift = Math.abs(audio.currentTime - positionSeconds);
      if (audio.paused && drift > 2) audio.currentTime = positionSeconds;
      void audio.play().catch(() => {
        // Autoplay policy: only a gesture can start sound. Reflect reality.
        if (!audio.paused) return;
        setPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [active, volume, muted, rate, positionSeconds, setPlaying]);

  /* remember the playhead so the watch page can resume seamlessly */
  const rememberPosition = useCallback(() => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.currentTime)) setPosition(audio.currentTime);
  }, [setPosition]);

  /* media session: metadata, transport controls, position */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !item) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: item.title,
      artist: item.channelName ?? "Freetube",
      album: "Freetube",
      artwork: item.thumbnail ? [{ src: item.thumbnail, sizes: "480x360", type: "image/jpeg" }] : [],
    });

    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => setPlaying(true)],
      ["pause", () => setPlaying(false)],
      ["stop", () => usePlayerStore.getState().stopPlayback()],
      ["nexttrack", () => next()],
      ["previoustrack", () => previous()],
      [
        "seekbackward",
        (details) => {
          const audio = audioRef.current;
          if (audio) audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset ?? 10));
        },
      ],
      [
        "seekforward",
        (details) => {
          const audio = audioRef.current;
          if (audio) audio.currentTime += details.seekOffset ?? 10;
        },
      ],
      [
        "seekto",
        (details) => {
          const audio = audioRef.current;
          if (audio && typeof details.seekTime === "number") audio.currentTime = details.seekTime;
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        /* unsupported action on this browser */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [item, next, previous, setPlaying]);

  /* position state so the lock screen scrubber is accurate */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const update = () => {
      if (!audio.duration || !Number.isFinite(audio.duration)) return;
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: Math.min(audio.currentTime, audio.duration),
        });
      } catch {
        /* best effort */
      }
      rememberPosition();
    };
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("durationchange", update);
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("durationchange", update);
    };
  }, [rememberPosition]);

  return (
    <audio
      ref={audioRef}
      preload="none"
      playsInline
      onEnded={() => {
        // Only a real "ended" advances; closing the player never reaches here.
        rememberPosition();
        next();
      }}
      onPause={() => {
        if (usePlayerStore.getState().playing && !active) return;
      }}
      className="hidden"
    />
  );
}
