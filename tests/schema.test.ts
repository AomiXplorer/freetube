import { describe, expect, it } from "vitest";
import { parseOrThrow, playerResponse } from "@/lib/innertube/schema";

describe("playerResponse schema", () => {
  it("accepts a realistic OK payload", () => {
    const parsed = parseOrThrow(
      playerResponse,
      {
        playabilityStatus: { status: "OK" },
        videoDetails: { videoId: "abc", title: "Title", lengthSeconds: "120" },
        streamingData: {
          adaptiveFormats: [
            {
              itag: 137,
              url: "https://r1.googlevideo.com/videoplayback",
              mimeType: 'video/mp4; codecs="avc1.640028"',
              height: 1080,
              bitrate: 4000000,
              contentLength: "1000",
            },
          ],
        },
      },
      "player",
    );
    expect(parsed.streamingData?.adaptiveFormats?.[0]?.itag).toBe(137);
  });

  it("rejects payloads with the wrong structure", () => {
    expect(() => parseOrThrow(playerResponse, { streamingData: "nope" }, "player")).toThrow(
      /Invalid player response/,
    );
  });

  it("tolerates unknown extra fields", () => {
    const parsed = parseOrThrow(
      playerResponse,
      { playabilityStatus: { status: "ERROR", reason: "blocked", somethingNew: true }, extra: 1 },
      "player",
    );
    expect(parsed.playabilityStatus?.reason).toBe("blocked");
  });
});
