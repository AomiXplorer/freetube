import { describe, expect, it } from "vitest";
import { collectVideos, findContinuation, text, thumbnails } from "@/lib/innertube/parse/walk";
import { parseSearch } from "@/lib/innertube/parse/search";
import { parseWatchNext } from "@/lib/innertube/parse/video";
import { parseHome, parseChips } from "@/lib/innertube/parse/home";
import searchFixture from "./fixtures/search.json";
import watchFixture from "./fixtures/watch.json";

describe("text()", () => {
  it("reads simpleText, runs and content", () => {
    expect(text({ simpleText: "hi" })).toBe("hi");
    expect(text({ runs: [{ text: "a" }, { text: "b" }] })).toBe("ab");
    expect(text({ content: "ok" })).toBe("ok");
    expect(text(undefined)).toBeUndefined();
  });
});

describe("thumbnails()", () => {
  it("normalises protocol-relative urls", () => {
    expect(thumbnails({ thumbnails: [{ url: "//i.ytimg.com/x.jpg" }] })[0]?.url).toBe(
      "https://i.ytimg.com/x.jpg",
    );
  });
});

describe("collectVideos()", () => {
  it("parses legacy videoRenderer and new lockupViewModel from one payload", () => {
    const videos = collectVideos(searchFixture);
    expect(videos).toHaveLength(2);

    const [legacy, lockup] = videos;
    expect(legacy?.id).toBe("dQw4w9WgXcQ");
    expect(legacy?.title).toContain("Rick Astley");
    expect(legacy?.durationSeconds).toBe(213);
    expect(legacy?.views).toBe(1832421778);
    expect(legacy?.channel.name).toBe("Rick Astley");
    expect(legacy?.channel.id).toBe("UCuAXFkgsw1L7xaCfnd5JJOw");

    expect(lockup?.id).toBe("Khow-kh-af4");
    expect(lockup?.durationText).toBe("1:29:42");
    expect(lockup?.views).toBe(1200000);
    expect(lockup?.publishedText).toBe("2 days ago");
    expect(lockup?.channel.name).toBe("KAYE MOVIES");
  });

  it("deduplicates repeated videos", () => {
    const duplicated = { a: searchFixture.contents, b: searchFixture.contents };
    expect(collectVideos(duplicated)).toHaveLength(2);
  });
});

describe("parseSearch()", () => {
  it("returns videos, channels and continuation", () => {
    const page = parseSearch(searchFixture, "rick astley");
    expect(page.query).toBe("rick astley");
    expect(page.videos).toHaveLength(2);
    expect(page.channels).toHaveLength(1);
    expect(page.channels[0]?.name).toBe("Rick Astley");
  });
});

describe("parseWatchNext()", () => {
  it("extracts title, channel, description, comments token and related videos", () => {
    const payload = parseWatchNext(watchFixture, "dQw4w9WgXcQ");
    expect(payload.details.title).toBe("Big Buck Bunny");
    expect(payload.details.views).toBe(12345678);
    expect(payload.details.likeCountText).toBe("120K");
    expect(payload.details.channel.name).toBe("Blender Foundation");
    expect(payload.details.description).toContain("giant rabbit");
    expect(payload.commentsContinuation).toBe("COMMENTS_TOKEN");
    expect(payload.related).toHaveLength(1);
    expect(payload.related[0]?.id).toBe("aqz-KE-bpKQ");
    expect(payload.related[0]?.durationSeconds).toBe(634);
  });
});

describe("parseHome() + parseChips()", () => {
  it("groups rich items into a section and keeps order", () => {
    const feed = parseHome(searchFixture);
    expect(feed.sections.flatMap((section) => section.items)).toHaveLength(2);
    expect(feed.chips).toEqual([]);
  });

  it("parses chip cloud entries with their params", () => {
    const chips = parseChips({
      chips: {
        feedFilterChipBarRenderer: {
          contents: [
            {
              chipCloudChipRenderer: {
                text: { simpleText: "Music" },
                navigationEndpoint: { payload: { params: "MUSIC_PARAMS" } },
                isSelected: true,
              },
            },
            { chipCloudChipRenderer: { text: { simpleText: "Gaming" } } },
          ],
        },
      },
    });
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ title: "Music", params: "MUSIC_PARAMS", selected: true });
  });
});

describe("findContinuation()", () => {
  it("prefers the requested section", () => {
    const token = findContinuation(watchFixture, "comment-item-section");
    expect(token).toBe("COMMENTS_TOKEN");
  });
});
