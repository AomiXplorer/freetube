import { describe, expect, it } from "vitest";
import { collectVideos } from "@/lib/innertube/parse/walk";
import { parseHome } from "@/lib/innertube/parse/home";

/**
 * The signed-in (OAuth) home feed is served by the TV client and uses
 * tileRenderer inside shelfRenderer. These fixtures mirror that tree, so a
 * renderer reshuffle shows up here rather than as an empty home page.
 */
const tile = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  header: {
    tileHeaderRenderer: {
      title: { simpleText: title },
      thumbnail: {
        thumbnails: [{ url: `//i.ytimg.com/vi/${id}/hqdefault.jpg`, width: 480, height: 360 }],
      },
      lengthText: { simpleText: "12:34" },
      shortBylineText: { runs: [{ text: "Some Channel", navigationEndpoint: { browseEndpoint: { browseId: "UC123" } } }] },
      ...extra,
    },
  },
  onSelectCommand: { watchEndpoint: { videoId: id } },
  metadata: {
    tileMetadataRenderer: {
      lines: [
        {
          lineRenderer: {
            items: [
              { lineItemRenderer: { text: { simpleText: "1.2M views" } } },
              { lineItemRenderer: { text: { simpleText: "3 days ago" } } },
            ],
          },
        },
      ],
    },
  },
});

const tvFeed = {
  contents: {
    tvBrowseRenderer: {
      content: {
        tvSurfaceContentRenderer: {
          content: {
            sectionListRenderer: {
              contents: [
                {
                  shelfRenderer: {
                    title: { simpleText: "Recommended" },
                    content: {
                      horizontalListRenderer: {
                        items: [
                          { tileRenderer: tile("aaaaaaaaaaa", "Video A") },
                          { tileRenderer: tile("bbbbbbbbbbb", "Video B") },
                          { tileRenderer: tile("ccccccccccc", "Video C") },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
};

describe("TV (Cobalt) feed", () => {
  it("extracts videos from tileRenderer shelves", () => {
    const videos = collectVideos(tvFeed);
    expect(videos.map((v) => v.id)).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]);
    const first = videos[0]!;
    expect(first.title).toBe("Video A");
    expect(first.durationText).toBe("12:34");
    expect(first.durationSeconds).toBe(754);
    expect(first.channel.name).toBe("Some Channel");
    expect(first.channel.id).toBe("UC123");
    expect(first.viewCountText).toBe("1.2M views");
    expect(first.publishedText).toBe("3 days ago");
  });

  it("splits the feed into a titled section", () => {
    const feed = parseHome(tvFeed);
    expect(feed.sections).toHaveLength(1);
    expect(feed.sections[0]!.title).toBe("Recommended");
    expect(feed.sections[0]!.items).toHaveLength(3);
  });

  it("returns nothing for the signed-out nudge so the caller can fall through", () => {
    const nudge = {
      contents: {
        tvBrowseRenderer: {
          content: {
            tvSurfaceContentRenderer: { content: { feedNudgeRenderer: { title: { simpleText: "Start watching" } } } },
          },
        },
      },
    };
    expect(parseHome(nudge).sections).toHaveLength(0);
  });
});
