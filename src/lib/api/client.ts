/** Typed browser-side fetchers for our own route handlers. */
import type {
  ChannelPage,
  CommentsPage,
  HomeFeed,
  PlaylistPage,
  SearchPage,
  StreamInfo,
  VideoDetails,
  VideoSummary,
} from "@/lib/innertube/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      /* keep default message */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export type VideoBundle = {
  details: VideoDetails;
  streams: StreamInfo | null;
  related: VideoSummary[];
  commentsContinuation?: string;
  source?: { client: string };
};

export function fetchVideo(id: string): Promise<VideoBundle> {
  return getJson<VideoBundle>(`/api/video/${id}`);
}

export type HomeResponse = HomeFeed & {
  /** "personal" = straight from the account feed, "popular" = substitute feed. */
  source: "personal" | "popular";
  signedIn: boolean;
  client?: string;
};

export function fetchHome(
  params?: string,
  continuation?: string,
  options: { refresh?: boolean } = {},
): Promise<HomeResponse> {
  const search = new URLSearchParams();
  if (params) search.set("params", params);
  if (continuation) search.set("continuation", continuation);
  if (options.refresh) search.set("refresh", "1");
  return getJson(`/api/home?${search.toString()}`, { cache: "no-store" });
}

export function fetchSearch(input: {
  query: string;
  sort?: string;
  type?: string;
  duration?: string;
  uploadDate?: string;
  continuation?: string;
}): Promise<SearchPage> {
  const search = new URLSearchParams({ q: input.query });
  for (const key of ["sort", "type", "duration", "uploadDate", "continuation"] as const) {
    if (input[key]) search.set(key, input[key] as string);
  }
  return getJson<SearchPage>(`/api/search?${search.toString()}`);
}

export function fetchChannel(id: string, params?: string): Promise<ChannelPage> {
  const search = new URLSearchParams();
  if (params) search.set("params", params);
  return getJson<ChannelPage>(`/api/channel/${id}?${search.toString()}`);
}

export function fetchPlaylist(id: string): Promise<PlaylistPage> {
  return getJson<PlaylistPage>(`/api/playlist/${id}`);
}

export function fetchCommentsPage(continuation: string): Promise<CommentsPage> {
  return getJson<CommentsPage>(`/api/comments?continuation=${encodeURIComponent(continuation)}`);
}
