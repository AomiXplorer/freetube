import { innertube } from "../client";
import { parseContinuationVideos } from "../parse/home";
import { parseSearch } from "../parse/search";
import type { SearchPage } from "../types";
import { buildSearchParams, type SearchFilters } from "../params";

export type SearchResult = SearchPage & { params?: string };

/** Search videos/channels/playlists. Cached 5 minutes per query+filters. */
export async function searchVideos(
  query: string,
  options: { filters?: SearchFilters; continuation?: string } = {},
): Promise<SearchResult> {
  const params = options.continuation ? undefined : buildSearchParams(options.filters ?? {});

  if (options.continuation) {
    const { data } = await innertube({
      endpoint: "search",
      body: { continuation: options.continuation },
      ttl: 300,
      cacheTag: `cont:${options.continuation.slice(0, 24)}`,
    });
    const { videos, continuation } = parseContinuationVideos(data);
    return { query, videos, channels: [], playlists: [], continuation };
  }

  const { data } = await innertube({
    endpoint: "search",
    body: { query, ...(params ? { params } : {}) },
    ttl: 300,
    cacheTag: `q:${query}|${params ?? ""}`,
  });

  return { ...parseSearch(data, query), params };
}

/** Autosuggest via YouTube's public completion endpoint. */
export async function suggestQueries(query: string): Promise<string[]> {
  const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&hl=en&xssi=t&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const raw = await res.text();
    const json = JSON.parse(raw.replace(/^\)\]\}'/, "")) as [string, [string, number][]];
    return (json[1] ?? []).map((entry) => entry[0]).slice(0, 10);
  } catch {
    return [];
  }
}
