import { beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore, type QueueItem } from "@/store/player";

const track = (id: string): QueueItem => ({ videoId: id, title: `Track ${id}`, channelName: "Chan" });

/**
 * The mini player's X used to call removeFromQueue, which re-indexed the queue
 * and let the audio engine slide onto the next track - "closing" a video looked
 * like pressing next. These tests pin down the difference between a real stop
 * and a natural end of playback.
 */
describe("player store: close vs ended", () => {
  beforeEach(() => {
    usePlayerStore.setState({
      queue: [],
      index: 0,
      playing: false,
      miniOpen: false,
      positionSeconds: 0,
      stopToken: 0,
    });
  });

  it("stopPlayback clears the queue, stops sound and signals players to tear down", () => {
    const state = usePlayerStore.getState();
    state.setQueue([track("aaaaaaaaaaa"), track("bbbbbbbbbbb")], 0);
    usePlayerStore.setState({ playing: true, positionSeconds: 42, miniOpen: true });

    const before = usePlayerStore.getState().stopToken;
    usePlayerStore.getState().stopPlayback();

    const after = usePlayerStore.getState();
    expect(after.queue).toHaveLength(0);
    expect(after.playing).toBe(false);
    expect(after.miniOpen).toBe(false);
    expect(after.positionSeconds).toBe(0);
    expect(after.stopToken).toBe(before + 1);
  });

  it("stopPlayback never advances to the next track", () => {
    usePlayerStore.getState().setQueue([track("aaaaaaaaaaa"), track("bbbbbbbbbbb")], 0);
    usePlayerStore.getState().stopPlayback();
    expect(usePlayerStore.getState().index).toBe(0);
    expect(usePlayerStore.getState().queue).toHaveLength(0);
  });

  it("a natural ended event still advances the queue", () => {
    usePlayerStore.getState().setQueue([track("aaaaaaaaaaa"), track("bbbbbbbbbbb")], 0);
    usePlayerStore.getState().next();

    const state = usePlayerStore.getState();
    expect(state.index).toBe(1);
    expect(state.queue[1].videoId).toBe("bbbbbbbbbbb");
    expect(state.playing).toBe(true);
  });

  it("repeat one keeps the same track but stops at the end of a one-shot queue", () => {
    usePlayerStore.getState().setQueue([track("aaaaaaaaaaa")], 0);
    usePlayerStore.setState({ repeat: "off" });
    usePlayerStore.getState().next();
    expect(usePlayerStore.getState().playing).toBe(false);

    usePlayerStore.setState({ repeat: "one", playing: true });
    usePlayerStore.getState().next();
    expect(usePlayerStore.getState().playing).toBe(true);
    expect(usePlayerStore.getState().index).toBe(0);
  });

  it("position is shared so the watch page and audio engine hand off cleanly", () => {
    usePlayerStore.getState().setPosition(123.5);
    expect(usePlayerStore.getState().positionSeconds).toBe(123.5);
    usePlayerStore.getState().stopPlayback();
    expect(usePlayerStore.getState().positionSeconds).toBe(0);
  });
});
