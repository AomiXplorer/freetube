import { describe, expect, it } from "vitest";
import { parseComments } from "@/lib/innertube/parse/comments";
import fixture from "./fixtures/comments.json";

describe("parseComments (entity batch model)", () => {
  it("resolves threads against commentEntityPayload mutations", () => {
    const page = parseComments(fixture);
    expect(page.comments).toHaveLength(2);
    expect(page.disabled).toBe(false);

    const [first, second] = page.comments;
    expect(first?.id).toBe("UgzKYksqeQ5gA3t0g0F4AaABAg");
    expect(first?.author).toBe("alice");
    expect(first?.content).toBe("First comment body");
    expect(first?.likeCountText).toBe("106K");
    expect(first?.replyCount).toBe(652);
    expect(first?.publishedText).toBe("6 years ago");
    expect(first?.authorAvatar?.[0]?.url).toBe("https://yt3.ggpht.com/a=s88");

    expect(second?.author).toBe("bob");
    expect(second?.replyCount).toBeUndefined();
  });

  it("returns the trailing continuation token, not a reply token", () => {
    expect(parseComments(fixture).continuation).toBe("NEXT_COMMENTS_TOKEN");
  });

  it("still parses legacy commentRenderer payloads", () => {
    const legacy = {
      continuationContents: {
        commentSectionRenderer: {
          contents: [
            {
              commentRenderer: {
                commentId: "legacy-1",
                contentText: { runs: [{ text: "old style" }] },
                authorText: { simpleText: "@carol" },
                voteCount: { simpleText: "7" },
                publishedTimeText: { simpleText: "2 hours ago" },
              },
            },
          ],
        },
      },
    };
    const page = parseComments(legacy);
    expect(page.comments[0]?.content).toBe("old style");
    expect(page.comments[0]?.likeCountText).toBe("7");
  });

  it("flags a turned-off comment section", () => {
    const page = parseComments({
      onResponseReceivedEndpoints: [
        {
          reloadContinuationItemsCommand: {
            continuationItems: [
              { commentsHeaderRenderer: { commentsDisabled: true } },
            ],
          },
        },
      ],
    });
    expect(page.disabled).toBe(true);
    expect(page.comments).toHaveLength(0);
  });
});
