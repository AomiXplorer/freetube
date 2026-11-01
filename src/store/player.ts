"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type QueueItem = {
  videoId: string;
  title: string;
  channelName?: string;
  thumbnail?: string;
  durationSeconds?: number;
};

export type RepeatMode = "off" | "one" | "all";

type PlayerState = {
  queue: QueueItem[];
  index: number;
  playing: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  quality: string | "auto";
  repeat: RepeatMode;
  shuffle: boolean;
  backgroundAudio: boolean;
  /** Play audio only: keeps sound alive with the screen off or the tab hidden. */
  audioOnly: boolean;
  miniOpen: boolean;
  /** Bumped by stopPlayback() so mounted players tear down their listeners. */
  stopToken: number;
  /** Shared playhead so the watch player and the audio engine hand off cleanly. */
  positionSeconds: number;
  sleepTimerEndsAt: number | null;
  sponsorBlock: boolean;
  setQueue: (queue: QueueItem[], startIndex?: number) => void;
  enqueue: (item: QueueItem, next?: boolean) => void;
  removeFromQueue: (videoId: string) => void;
  clearQueue: () => void;
  next: () => void;
  previous: () => void;
  setPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
  toggleMuted: () => void;
  setRate: (rate: number) => void;
  setQuality: (quality: string | "auto") => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  setBackgroundAudio: (enabled: boolean) => void;
  setAudioOnly: (enabled: boolean) => void;
  setMiniOpen: (open: boolean) => void;
  setPosition: (seconds: number) => void;
  /** Hard stop: no autoplay-next, no queue, no mini player. */
  stopPlayback: () => void;
  startSleepTimer: (minutes: number) => void;
  clearSleepTimer: () => void;
  setSponsorBlock: (enabled: boolean) => void;
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      index: 0,
      playing: false,
      volume: 1,
      muted: false,
      rate: 1,
      quality: "auto",
      repeat: "off",
      shuffle: false,
      backgroundAudio: true,
      audioOnly: false,
      miniOpen: false,
      stopToken: 0,
      positionSeconds: 0,
      sleepTimerEndsAt: null,
      sponsorBlock: false,

      setQueue: (queue, startIndex = 0) =>
        set({ queue, index: Math.max(0, Math.min(startIndex, queue.length - 1)), playing: true }),

      enqueue: (item, next = false) => {
        const { queue, index } = get();
        const filtered = queue.filter((entry) => entry.videoId !== item.videoId);
        if (next) {
          const copy = [...filtered];
          copy.splice(index + 1, 0, item);
          set({ queue: copy });
          return;
        }
        set({ queue: [...filtered, item] });
      },

      removeFromQueue: (videoId) =>
        set((state) => {
          const queue = state.queue.filter((item) => item.videoId !== videoId);
          return { queue, index: Math.min(state.index, Math.max(0, queue.length - 1)) };
        }),

      clearQueue: () => set({ queue: [], index: 0, playing: false }),

      next: () => {
        const { queue, index, repeat, shuffle } = get();
        if (!queue.length) return;
        if (repeat === "one") {
          set({ index, playing: true });
          return;
        }
        if (shuffle && queue.length > 1) {
          let random = index;
          while (random === index) random = Math.floor(Math.random() * queue.length);
          set({ index: random, playing: true });
          return;
        }
        const nextIndex = index + 1;
        if (nextIndex >= queue.length) {
          if (repeat === "all") set({ index: 0, playing: true });
          else set({ playing: false });
          return;
        }
        set({ index: nextIndex, playing: true });
      },

      previous: () => {
        const { queue, index, repeat } = get();
        if (!queue.length) return;
        let prevIndex = index - 1;
        if (prevIndex < 0) prevIndex = repeat === "all" ? queue.length - 1 : 0;
        set({ index: prevIndex, playing: true });
      },

      setPlaying: (playing) => set({ playing }),
      setVolume: (volume) => set({ volume, muted: volume === 0 }),
      toggleMuted: () => set((state) => ({ muted: !state.muted })),
      setRate: (rate) => set({ rate }),
      setQuality: (quality) => set({ quality }),
      cycleRepeat: () =>
        set((state) => ({
          repeat: state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off",
        })),
      toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
      setBackgroundAudio: (backgroundAudio) => set({ backgroundAudio }),
      setAudioOnly: (audioOnly) => set({ audioOnly }),
      setMiniOpen: (miniOpen) => set({ miniOpen }),
      setPosition: (positionSeconds) => set({ positionSeconds }),
      stopPlayback: () =>
        set((state) => ({
          queue: [],
          index: 0,
          playing: false,
          miniOpen: false,
          positionSeconds: 0,
          stopToken: state.stopToken + 1,
        })),
      startSleepTimer: (minutes) =>
        set({ sleepTimerEndsAt: Date.now() + minutes * 60_000 }),
      clearSleepTimer: () => set({ sleepTimerEndsAt: null }),
      setSponsorBlock: (sponsorBlock) => set({ sponsorBlock }),
    }),
    {
      name: "freetube-player",
      partialize: (state) => ({
        volume: state.volume,
        muted: state.muted,
        rate: state.rate,
        quality: state.quality,
        repeat: state.repeat,
        shuffle: state.shuffle,
        backgroundAudio: state.backgroundAudio,
        audioOnly: state.audioOnly,
        sponsorBlock: state.sponsorBlock,
        queue: state.queue,
        index: state.index,
      }),
    },
  ),
);

export function currentQueueItem(): QueueItem | undefined {
  const { queue, index } = usePlayerStore.getState();
  return queue[index];
}
