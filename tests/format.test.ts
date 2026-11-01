import { describe, expect, it } from "vitest";
import {
  bestThumb,
  formatDuration,
  normalizeThumbUrl,
  parseCountLabel,
  parseDurationText,
  timeAgo,
} from "@/lib/utils/format";

describe("parseCountLabel", () => {
  it("parses comma separated counts", () => {
    expect(parseCountLabel("1,832,421,778 views")).toBe(1832421778);
  });
  it("parses K/M/B suffixes", () => {
    expect(parseCountLabel("1.8M views")).toBe(1800000);
    expect(parseCountLabel("12K views")).toBe(12000);
    expect(parseCountLabel("2.4B views")).toBe(2400000000);
  });
  it("returns undefined for text without numbers", () => {
    expect(parseCountLabel("No views")).toBeUndefined();
    expect(parseCountLabel(undefined)).toBeUndefined();
  });
});

describe("duration helpers", () => {
  it("parses mm:ss and hh:mm:ss", () => {
    expect(parseDurationText("4:20")).toBe(260);
    expect(parseDurationText("1:02:03")).toBe(3723);
    expect(parseDurationText("42")).toBe(42);
  });
  it("formats seconds back into a clock", () => {
    expect(formatDuration(260)).toBe("4:20");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(undefined)).toBe("");
  });
});

describe("thumbnails", () => {
  it("picks the largest thumbnail and normalises protocol-relative urls", () => {
    const url = bestThumb([
      { url: "//i.ytimg.com/vi/abc/hqdefault.jpg=s1", width: 100 },
      { url: "https://i.ytimg.com/vi/abc/maxresdefault.jpg=s2", width: 1280 },
    ]);
    expect(url).toBe("https://i.ytimg.com/vi/abc/maxresdefault.jpg");
  });
  it("strips size suffixes", () => {
    expect(normalizeThumbUrl("https://i.ytimg.com/vi/x/hq.jpg=s240-c-k")).toBe(
      "https://i.ytimg.com/vi/x/hq.jpg",
    );
  });
  it("returns undefined for empty input", () => {
    expect(bestThumb([])).toBeUndefined();
  });
});

describe("timeAgo", () => {
  it("describes recent timestamps", () => {
    expect(timeAgo(new Date(Date.now() - 90_000).toISOString())).toBe("1m ago");
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe("3h ago");
  });
  it("returns undefined for invalid input", () => {
    expect(timeAgo("not-a-date")).toBeUndefined();
  });
});
