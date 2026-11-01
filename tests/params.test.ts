import { describe, expect, it } from "vitest";
import { buildSearchParams, decodeParamsRaw } from "@/lib/innertube/params";

/** Known encodings emitted by YouTube's own UI. */
describe("buildSearchParams", () => {
  it("matches YouTube's upload-date sort encoding", () => {
    expect(decodeURIComponent(buildSearchParams({ sort: "date" })!)).toBe("CAI=");
  });
  it("matches YouTube's video type encoding", () => {
    expect(decodeURIComponent(buildSearchParams({ type: "video" })!)).toBe("EgIQAQ==");
  });
  it("matches YouTube's short duration encoding", () => {
    expect(decodeURIComponent(buildSearchParams({ duration: "short" })!)).toBe("EgIYAQ==");
  });
  it("matches YouTube's today upload encoding", () => {
    expect(decodeURIComponent(buildSearchParams({ uploadDate: "today" })!)).toBe("EgIIAg==");
  });
  it("returns undefined when no filters are set", () => {
    expect(buildSearchParams({})).toBeUndefined();
    expect(buildSearchParams({ sort: "relevance", type: "all", duration: "any" })).toBeUndefined();
  });

  it("round-trips combined filters", () => {
    const params = buildSearchParams({ sort: "views", type: "video", duration: "long", uploadDate: "week" });
    const decoded = decodeParamsRaw(params!);
    expect(decoded.sort).toBe(3);
    expect(decoded.filters).toMatchObject({ "1": 3, "2": 1, "3": 2 });
  });
});
