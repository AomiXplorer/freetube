"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  Check,
  Gauge,
  Headphones,
  Maximize,
  Minimize,
  MoreVertical,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { clamp, formatDuration } from "@/lib/utils/format";
import { Slider } from "@/components/ui/slider";
import { Dropdown, DropdownItem, DropdownLabel } from "@/components/ui/dropdown";
import { usePlayerStore } from "@/store/player";
import type { CaptionTrack, StreamInfo, VideoDetails } from "@/lib/innertube/types";

type SponsorSegment = { category: string; segment: [number, number] };

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export type VideoPlayerProps = {
  details: VideoDetails;
  streams: StreamInfo | null;
  autoPlay?: boolean;
  startAt?: number;
  theater?: boolean;
  onTheaterChange?: (theater: boolean) => void;
};

export function VideoPlayer({
  details,
  streams,
  autoPlay = true,
  startAt = 0,
  theater,
  onTheaterChange,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    volume,
    muted,
    rate,
    quality,
    setVolume,
    toggleMuted,
    setRate,
    setQuality,
    backgroundAudio,
    audioOnly,
    setAudioOnly,
    stopToken,
    setPosition,
  } = usePlayerStore();
  const nextVideo = usePlayerStore((state) => state.next);
  const sleepTimerEndsAt = usePlayerStore((state) => state.sleepTimerEndsAt);
  const clearSleepTimer = usePlayerStore((state) => state.clearSleepTimer);
  const sponsorBlock = usePlayerStore((state) => state.sponsorBlock);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(details.durationSeconds ?? 0);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [currentStreams, setCurrentStreams] = useState<StreamInfo | null>(streams ?? null);
  const [embedFallback, setEmbedFallback] = useState(!streams?.formats?.length);
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const recoveredRef = useRef(false);
  const [gestureHint, setGestureHint] = useState<string | null>(null);
  const [segments, setSegments] = useState<SponsorSegment[]>([]);
  const [skipped, setSkipped] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioSyncRef = useRef<number | null>(null);

  // A retry (or a fresh /api/stream response) replaces the prop without a remount.
  useEffect(() => {
    if (streams) setCurrentStreams(streams);
  }, [streams]);

  const videoFormats = useMemo(
    () => (currentStreams?.formats ?? []).filter((format) => format.hasVideo),
    [currentStreams],
  );
  const audioFormat = useMemo(
    () =>
      (currentStreams?.formats ?? [])
        .filter((format) => format.hasAudio && !format.hasVideo)
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0],
    [currentStreams],
  );

  const selectedFormat = useMemo(() => {
    const muxed = videoFormats.filter((format) => format.hasAudio);
    const pool = muxed.length ? muxed : videoFormats;
    if (!pool.length) return undefined;
    if (quality === "auto") {
      return [...pool].sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
    }
    const wanted = Number.parseInt(quality, 10);
    return (
      [...pool].sort(
        (a, b) => Math.abs((a.height ?? 0) - wanted) - Math.abs((b.height ?? 0) - wanted),
      )[0] ?? pool[0]
    );
  }, [videoFormats, quality]);

  const needsSeparateAudio = Boolean(selectedFormat && !selectedFormat.hasAudio && audioFormat);

  const qualityOptions = useMemo(() => {
    const seen = new Set<number>();
    return videoFormats
      .filter((format) => {
        const height = format.height ?? 0;
        if (!height || seen.has(height)) return false;
        seen.add(height);
        return true;
      })
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  }, [videoFormats]);

  /* ---------------------------------------------------------------- media session + metadata */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: details.title,
      artist: details.channel.name,
      album: "Freetube",
      artwork: details.thumbnails.slice(-2).map((thumb) => ({
        src: thumb.url,
        sizes: `${thumb.width ?? 480}x${thumb.height ?? 270}`,
        type: "image/jpeg",
      })),
    });
    const player = () => videoRef.current;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => player()?.play().catch(() => undefined)],
      ["pause", () => player()?.pause()],
      ["stop", () => usePlayerStore.getState().stopPlayback()],
      ["nexttrack", () => nextVideo()],
      ["previoustrack", () => usePlayerStore.getState().previous()],
      ["seekbackward", (event) => seekBy(-(event.seekOffset ?? 10))],
      ["seekforward", (event) => seekBy(event.seekOffset ?? 10)],
      [
        "seekto",
        (event) => {
          if (!player() || typeof event.seekTime !== "number") return;
          player()!.currentTime = event.seekTime;
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* action unsupported here */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.id, details.title, details.channel.name, nextVideo]);

  /* --------------------------------------------------- background / audio-only handoff */
  const autoAudioOnly = useRef(false);

  useEffect(() => {
    const handler = () => {
      const hidden = document.visibilityState === "hidden";
      if (hidden && backgroundAudio && !usePlayerStore.getState().audioOnly) {
        // Screen off / tab hidden: keep the timeline moving on the audio element
        // instead of letting the browser suspend video decoding.
        autoAudioOnly.current = true;
        setAudioOnly(true);
        return;
      }
      if (!hidden && autoAudioOnly.current) {
        autoAudioOnly.current = false;
        setAudioOnly(false);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [backgroundAudio, setAudioOnly]);

  /* hard stop from the mini player: kill every listener, never autoplay next */
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    video.pause();
    audio?.pause();
    setPlaying(false);
    // A stop means the user closed the player; do not resume from a stale cue.
    video.removeAttribute("src");
    video.load();
  }, [stopToken, setPlaying]);

  /* When audio-only is on, the global engine owns sound: silence the video. */
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    if (audioOnly) {
      video.pause();
      audio?.pause();
      return;
    }
    // Coming back: continue from wherever the background audio left off.
    const resumeAt = usePlayerStore.getState().positionSeconds;
    if (resumeAt > 0 && Math.abs(video.currentTime - resumeAt) > 1) video.currentTime = resumeAt;
    if (usePlayerStore.getState().playing) {
      void video.play().catch(() => undefined);
      if (needsSeparateAudio) void audio?.play().catch(() => undefined);
    }
  }, [audioOnly, needsSeparateAudio]);

  /* ------------------------------------------------------------------------- sponsorblock */
  useEffect(() => {
    if (!sponsorBlock) {
      setSegments([]);
      return;
    }
    const controller = new AbortController();
    fetch(
      `https://sponsor.ajay.app/api/skipSegments?videoID=${details.id}&categories=${encodeURIComponent(
        JSON.stringify(["sponsor", "selfpromo", "interaction", "intro", "outro"]),
      )}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((data: SponsorSegment[]) => Array.isArray(data) && setSegments(data))
      .catch(() => undefined);
    return () => controller.abort();
  }, [details.id, sponsorBlock]);

  /* ------------------------------------------------------------------------- playing engine */
  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = clamp(video.currentTime + delta, 0, video.duration || Number.MAX_SAFE_INTEGER);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  }, []);

  const flashHint = useCallback((message: string) => {
    setGestureHint(message);
    setTimeout(() => setGestureHint(null), 650);
  }, []);

  /* attach source: HLS manifest when present, progressive otherwise */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentStreams) return;
    if (!currentStreams.hlsManifestUrl && !selectedFormat?.url) {
      setEmbedFallback(true);
      return;
    }
    setEmbedFallback(false);

    let destroyed = false;
    let hls: { destroy: () => void } | null = null;

    const attach = async () => {
      if (currentStreams.hlsManifestUrl && video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = currentStreams.hlsManifestUrl;
      } else if (currentStreams.hlsManifestUrl) {
        const mod = await import("hls.js");
        const Hls = mod.default;
        if (destroyed) return;
        if (Hls.isSupported()) {
          const instance = new Hls({ enableWorker: true, lowLatencyMode: true });
          instance.loadSource(currentStreams.hlsManifestUrl);
          instance.attachMedia(video);
          hls = instance;
        } else {
          video.src = currentStreams.hlsManifestUrl;
        }
      } else if (selectedFormat?.url) {
        video.src = selectedFormat.url;
      }

      video.currentTime = startAt > 0 ? startAt : 0;
      if (autoPlay) video.play().catch(() => undefined);
    };
    void attach();

    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [currentStreams, selectedFormat?.url, startAt, autoPlay]);

  /* separate audio track sync (adaptive formats without muxed audio) */
  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio || !video) return;
    if (!needsSeparateAudio || !audioFormat?.url) {
      audio.pause();
      audio.removeAttribute("src");
      return;
    }
    if (audio.src !== audioFormat.url) audio.src = audioFormat.url;
    audio.volume = muted ? 0 : volume;
    audio.playbackRate = rate;

    const sync = () => {
      if (Math.abs(audio.currentTime - video.currentTime) > 0.35) {
        audio.currentTime = video.currentTime;
      }
    };
    audioSyncRef.current = window.setInterval(sync, 1200);
    return () => {
      if (audioSyncRef.current) window.clearInterval(audioSyncRef.current);
    };
  }, [needsSeparateAudio, audioFormat?.url, muted, volume, rate]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    video.volume = muted ? 0 : volume;
    video.playbackRate = rate;
    if (audio) {
      audio.volume = muted ? 0 : volume;
      audio.playbackRate = rate;
    }
  }, [volume, muted, rate]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;
    if (playing) {
      void video.play().catch(() => undefined);
      if (needsSeparateAudio) void audio?.play().catch(() => undefined);
      if (audio) audio.currentTime = video.currentTime;
    } else {
      video.pause();
      audio?.pause();
    }
  }, [playing, needsSeparateAudio]);

  /* sleep timer */
  useEffect(() => {
    if (!sleepTimerEndsAt) return;
    const remaining = sleepTimerEndsAt - Date.now();
    if (remaining <= 0) {
      setPlaying(false);
      clearSleepTimer();
      return;
    }
    const timer = setTimeout(() => {
      setPlaying(false);
      clearSleepTimer();
    }, remaining);
    return () => clearTimeout(timer);
  }, [sleepTimerEndsAt, clearSleepTimer, setPlaying]);

  /* video events */
  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    setPosition(video.currentTime);
    if (video.buffered.length) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }
    if (needsSeparateAudio) {
      const audio = audioRef.current;
      if (audio && video.paused === false && audio.paused) void audio.play().catch(() => undefined);
    }
    if (segments.length) {
      const hit = segments.find(
        (segment) => video.currentTime >= segment.segment[0] && video.currentTime < segment.segment[1],
      );
      if (hit) {
        video.currentTime = hit.segment[1];
        setSkipped(hit.category);
        setTimeout(() => setSkipped(null), 2500);
      }
    }
    if ("mediaSession" in navigator && video.duration && Number.isFinite(video.duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: video.duration,
          playbackRate: video.playbackRate,
          position: video.currentTime,
        });
      } catch {
        /* position state is best-effort */
      }
    }
  };

  /* external seek requests (chapter list, "resume where you left off") */
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ seconds: number }>).detail;
      if (!detail || typeof detail.seconds !== "number" || !videoRef.current) return;
      videoRef.current.currentTime = detail.seconds;
      setCurrentTime(detail.seconds);
      void videoRef.current.play().catch(() => undefined);
    };
    window.addEventListener("freetube:seek", handler);
    return () => window.removeEventListener("freetube:seek", handler);
  }, []);

  /* keyboard shortcuts */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target?.isContentEditable) return;

      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          event.preventDefault();
          togglePlay();
          break;
        case "j":
          seekBy(-10);
          break;
        case "l":
          seekBy(10);
          break;
        case "arrowleft":
          seekBy(-5);
          break;
        case "arrowright":
          seekBy(5);
          break;
        case "arrowup":
          setVolume(clamp(volume + 0.05, 0, 1));
          break;
        case "arrowdown":
          setVolume(clamp(volume - 0.05, 0, 1));
          break;
        case "m":
          toggleMuted();
          break;
        case "f":
          void toggleFullscreen();
          break;
        case "t":
          onTheaterChange?.(!theater);
          break;
        case "c":
          setActiveTrack((current) => (current ? null : (details.captions[0]?.language ?? null)));
          break;
        case "i":
          void requestPip();
          break;
        case ">":
          setRate(Math.min(2, Number((rate + 0.25).toFixed(2))));
          break;
        case "<":
          setRate(Math.max(0.25, Number((rate - 0.25).toFixed(2))));
          break;
        default:
          if (/^[0-9]$/.test(event.key) && videoRef.current?.duration) {
            videoRef.current.currentTime = (videoRef.current.duration * Number(event.key)) / 10;
          }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, rate, theater, details.captions, togglePlay, seekBy, setVolume, toggleMuted, setRate]);

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setFullscreen(false);
      return;
    }
    await container.requestFullscreen().catch(() => undefined);
    setFullscreen(true);
  };

  const requestPip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      /* PiP unsupported (iOS Safari uses native controls) */
    }
  };

  const revealControls = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 2800);
  };

  /* touch gestures: double-tap seek + vertical swipes */
  const touchState = useRef<{ x: number; y: number; time: number; side: "left" | "right" | "center"; startVolume: number } | null>(null);

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const relativeX = (touch.clientX - rect.left) / rect.width;
    const side = relativeX < 0.3 ? "left" : relativeX > 0.7 ? "right" : "center";
    const lastTap = (event.currentTarget as HTMLElement).dataset.lastTap;
    const now = Date.now();
    if (lastTap && now - Number(lastTap) < 300) {
      if (side === "left") {
        seekBy(-10);
        flashHint("-10s");
      } else if (side === "right") {
        seekBy(10);
        flashHint("+10s");
      } else {
        togglePlay();
      }
      (event.currentTarget as HTMLElement).dataset.lastTap = "";
    } else {
      (event.currentTarget as HTMLElement).dataset.lastTap = String(now);
    }
    touchState.current = { x: touch.clientX, y: touch.clientY, time: now, side, startVolume: volume };
  };

  const onTouchMove = (event: React.TouchEvent) => {
    const state = touchState.current;
    const touch = event.touches[0];
    if (!state || !touch) return;
    const deltaY = state.y - touch.clientY;
    if (Math.abs(deltaY) < 24) return;
    if (state.side === "left") {
      setVolume(clamp(state.startVolume + deltaY / 200, 0, 1));
      flashHint(`Volume ${Math.round(clamp(state.startVolume + deltaY / 200, 0, 1) * 100)}%`);
    } else if (state.side === "right") {
      const brightness = clamp(1 - deltaY / 400, 0.25, 1);
      if (containerRef.current) containerRef.current.style.filter = `brightness(${brightness})`;
      flashHint(`Brightness ${Math.round(brightness * 100)}%`);
    }
  };

  const onTouchEnd = () => {
    touchState.current = null;
  };

  /** Refresh signed URLs from the server, then hand control back to the player. */
  const retryPlayback = useCallback(async () => {
    setRetryCount((count) => count + 1);
    setEmbedBlocked(false);
    recoveredRef.current = false;
    try {
      const res = await fetch(`/api/stream/${details.id}`);
      if (res.ok) {
        const data = (await res.json()) as { streams?: StreamInfo | null };
        if (data.streams?.formats?.length) {
          setCurrentStreams(data.streams);
          setEmbedFallback(false);
          return;
        }
      }
    } catch {
      /* fall through to the embed */
    }
    setEmbedFallback(true);
  }, [details.id]);

  /** First playback failure tries a fresh stream, the second falls back silently. */
  const onPlaybackError = useCallback(async () => {
    if (!recoveredRef.current) {
      recoveredRef.current = true;
      try {
        const res = await fetch(`/api/stream/${details.id}`);
        if (res.ok) {
          const data = (await res.json()) as { streams?: StreamInfo | null };
          if (data.streams?.formats?.length) {
            setCurrentStreams(data.streams);
            return;
          }
        }
      } catch {
        /* ignore and fall back */
      }
    }
    setEmbedFallback(true);
  }, [details.id]);

  const progressMax = duration || details.durationSeconds || 0;
  const qualityLabel =
    quality === "auto"
      ? selectedFormat?.qualityLabel ?? "Auto"
      : `${quality}p`;
  const currentChapter = [...details.chapters].reverse().find((chapter) => chapter.startSeconds <= currentTime);

  if (embedFallback) {
    if (embedBlocked) {
      return (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-black p-6 text-center text-white">
          <p className="text-sm">This video can&apos;t be played here right now.</p>
          <p className="text-xs text-white/60">It may be limited to the YouTube app or its owner blocked embedding.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={retryPlayback}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
            >
              <RefreshCw className="size-4" /> Try again
            </button>
            <a
              className="rounded-full border border-white/30 px-4 py-2 text-sm font-medium"
              href={`https://www.youtube.com/watch?v=${details.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Open on YouTube
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          key={`${details.id}-${retryCount}`}
          src={`https://www.youtube-nocookie.com/embed/${details.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`}
          title={details.title}
          className="absolute inset-0 size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <button
          type="button"
          onClick={retryPlayback}
          aria-label="Reload player"
          className="absolute bottom-2 right-2 inline-flex size-9 items-center justify-center rounded-full bg-black/60 text-white/80 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative w-full select-none overflow-hidden bg-black text-white",
        fullscreen ? "fixed inset-0 z-[200] h-dvh rounded-none" : "aspect-video rounded-xl",
      )}
      onMouseMove={revealControls}
      onTouchStart={(event) => {
        revealControls();
        onTouchStart(event);
      }}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={(event) => {
        if ((event.target as HTMLElement).dataset.preventToggle) return;
        togglePlay();
      }}
    >
      <video
        ref={videoRef}
        className="size-full object-contain"
        playsInline
        poster={details.thumbnails.at(-1)?.url}
        crossOrigin="anonymous"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onEnded={() => {
          const { repeat } = usePlayerStore.getState();
          if (repeat === "one") {
            videoRef.current?.play().catch(() => undefined);
            return;
          }
          nextVideo();
        }}
        onError={() => void onPlaybackError()}
        onDoubleClick={() => void toggleFullscreen()}
      >
        {details.captions.map((track: CaptionTrack) => (
          <track
            key={track.language}
            kind="subtitles"
            srcLang={track.language}
            label={track.label}
            src={`/api/proxy/timedtext?url=${encodeURIComponent(track.baseUrl)}&fmt=vtt`}
            default={activeTrack === track.language}
          />
        ))}
      </video>
      <audio ref={audioRef} className="hidden" />

      {gestureHint ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-black/70 px-4 py-2 text-sm font-medium">
          {gestureHint}
        </div>
      ) : null}

      {skipped ? (
        <div className="pointer-events-none absolute bottom-24 left-4 rounded-lg bg-black/80 px-3 py-2 text-xs">
          Skipped {skipped} segment
        </div>
      ) : null}

      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end transition-opacity duration-200",
          showControls ? "opacity-100" : "opacity-0",
        )}
      >
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          className="absolute inset-0 flex items-center justify-center"
          data-prevent-toggle="true"
          onClick={(event) => {
            event.stopPropagation();
            togglePlay();
          }}
        >
          {!playing ? (
            <span className="flex size-16 items-center justify-center rounded-full bg-black/60">
              <Play className="size-8 fill-white" />
            </span>
          ) : null}
        </button>

        <div className="player-gradient pointer-events-auto px-3 pb-2 pt-10">
          <div className="relative">
            <div className="absolute -top-1.5 flex w-full justify-between px-0.5">
              {details.chapters.map((chapter) => (
                <span
                  key={chapter.startSeconds}
                  className="h-1 w-px bg-white/50"
                  style={{ marginLeft: `${progressMax ? (chapter.startSeconds / progressMax) * 100 : 0}%` }}
                />
              ))}
            </div>
            <Slider
              aria-label="Seek"
              min={0}
              max={progressMax || 100}
              step={0.5}
              value={currentTime}
              onValueChange={(value) => {
                if (videoRef.current) videoRef.current.currentTime = value;
                setCurrentTime(value);
              }}
              className="h-1"
            />
            <div
              className="pointer-events-none absolute inset-y-0 left-0 h-1 rounded-full bg-white/30"
              style={{ width: `${progressMax ? (buffered / progressMax) * 100 : 0}%` }}
            />
          </div>

          <div className="mt-1 flex items-center gap-2 text-xs">
            <button type="button" data-prevent-toggle="true" aria-label="Play/pause" onClick={togglePlay} className="p-1.5">
              {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
            </button>
            <button
              type="button"
              data-prevent-toggle="true"
              aria-label="Next video"
              onClick={nextVideo}
              className="p-1.5"
            >
              <SkipForward className="size-5" />
            </button>
            <div className="flex items-center gap-1" data-prevent-toggle="true">
              <button type="button" aria-label="Mute" onClick={toggleMuted} className="p-1.5">
                {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
              <div className="hidden w-20 sm:block" data-prevent-toggle="true">
                <Slider
                  aria-label="Volume"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onValueChange={(value) => setVolume(value)}
                  className="h-1"
                />
              </div>
            </div>
            <span className="ml-1 tabular-nums text-white/90">
              {formatDuration(currentTime)} / {formatDuration(progressMax)}
            </span>
            {currentChapter ? (
              <span className="ml-2 hidden truncate text-white/70 md:block">{currentChapter.title}</span>
            ) : null}

            <div className="ml-auto flex items-center gap-0.5" data-prevent-toggle="true">
              {details.captions.length ? (
                <button
                  type="button"
                  aria-label="Captions"
                  onClick={() => setActiveTrack((current) => (current ? null : (details.captions[0]?.language ?? null)))}
                  className={cn("p-1.5", activeTrack && "text-red-500")}
                >
                  <Captions className="size-5" />
                </button>
              ) : null}
              <Dropdown
                trigger={
                  <button type="button" aria-label="Settings" className="p-1.5">
                    <Settings2 className="size-5" />
                  </button>
                }
              >
                <DropdownLabel>Quality</DropdownLabel>
                <DropdownItem active={quality === "auto"} onSelect={() => setQuality("auto")}>
                  Auto
                </DropdownItem>
                {qualityOptions.map((format) => (
                  <DropdownItem
                    key={format.itag}
                    active={quality === String(format.height)}
                    onSelect={() => setQuality(String(format.height))}
                  >
                    {format.qualityLabel ?? `${format.height}p`}
                  </DropdownItem>
                ))}
                <div className="my-1 border-t border-border" />
                <DropdownLabel>Speed</DropdownLabel>
                {RATES.map((option) => (
                  <DropdownItem key={option} active={rate === option} onSelect={() => setRate(option)}>
                    {option === 1 ? "Normal" : `${option}x`}
                  </DropdownItem>
                ))}
                {details.captions.length ? (
                  <>
                    <div className="my-1 border-t border-border" />
                    <DropdownLabel>Subtitles</DropdownLabel>
                    <DropdownItem active={!activeTrack} onSelect={() => setActiveTrack(null)}>
                      Off
                    </DropdownItem>
                    {details.captions.slice(0, 8).map((track) => (
                      <DropdownItem
                        key={track.language}
                        active={activeTrack === track.language}
                        onSelect={() => setActiveTrack(track.language)}
                      >
                        {track.label}
                      </DropdownItem>
                    ))}
                  </>
                ) : null}
                <div className="my-1 border-t border-border" />
                <DropdownItem icon={<Gauge className="size-4" />} onSelect={() => setRate(1)}>
                  Reset speed ({qualityLabel})
                </DropdownItem>
              </Dropdown>
              <button
                type="button"
                aria-label={audioOnly ? "Switch back to video" : "Listen with audio only"}
                aria-pressed={audioOnly}
                onClick={() => setAudioOnly(!audioOnly)}
                className={cn("p-1.5", audioOnly && "text-red-500")}
              >
                <Headphones className="size-5" />
              </button>
              <button type="button" aria-label="Picture in picture" onClick={requestPip} className="p-1.5">
                <PictureInPicture2 className="size-5" />
              </button>
              {onTheaterChange ? (
                <button
                  type="button"
                  aria-label="Theater mode"
                  onClick={() => onTheaterChange(!theater)}
                  className="hidden p-1.5 lg:block"
                >
                  <MoreVertical className="size-5" />
                </button>
              ) : null}
              <button type="button" aria-label="Fullscreen" onClick={toggleFullscreen} className="p-1.5">
                {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {fullscreen ? (
        <div className="absolute right-3 top-3 flex gap-2">
          <button type="button" aria-label="Rewind 10 seconds" onClick={() => seekBy(-10)} className="rounded-full bg-black/50 p-2">
            <RotateCcw className="size-4" />
          </button>
          <button type="button" aria-label="Forward 10 seconds" onClick={() => seekBy(10)} className="rounded-full bg-black/50 p-2">
            <RotateCw className="size-4" />
          </button>
          <button type="button" aria-label="Exit fullscreen" onClick={toggleFullscreen} className="rounded-full bg-black/50 p-2">
            <Check className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
