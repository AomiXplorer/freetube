import { cached, cacheKey } from "@/lib/cache";
import { getValidAccessToken } from "@/lib/auth/tokens";
import { innertube } from "../client";
import { parseOrThrow, playerResponse, streamingFormat, type StreamingFormat } from "../schema";
import { createUnlockContext, unlockUrl, type UnlockContext } from "../cipher";
import type { CaptionTrack, StreamInfo, VideoStreamFormat } from "../types";
import { chaptersFromAny } from "../parse/video";
import { text, type J } from "../parse/walk";

const PLAYER_JS_TTL = 60 * 60 * 6;

/** Resolve and cache YouTube's player JS (base.js) for the current signature scheme. */
async function getPlayerJs(): Promise<string | null> {
  return cached(cacheKey("playerjs"), PLAYER_JS_TTL, async () => {
    try {
      const res = await fetch("https://www.youtube.com/iframe_api", {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const script = await res.text();
      const match = /"([^"]*\/s\/player\/[^"]*?\/base\.js)"/.exec(script) ?? /src="([^"]*base\.js)"/.exec(script);
      const path = match?.[1];
      if (!path) return null;
      const jsRes = await fetch(path.startsWith("http") ? path : `https://www.youtube.com${path}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      });
      if (!jsRes.ok) return null;
      return await jsRes.text();
    } catch {
      return null;
    }
  });
}

function classify(formats: StreamingFormat[]): VideoStreamFormat[] {
  return formats
    .map((format) => {
      const mimeType = format.mimeType ?? "";
      const hasVideo = mimeType.startsWith("video/");
      const hasAudio = mimeType.startsWith("audio/");
      const codecs = /codecs="([^"]+)"/.exec(mimeType)?.[1];
      return {
        itag: format.itag,
        url: format.url ?? "",
        mimeType,
        qualityLabel: format.qualityLabel,
        height: format.height,
        width: format.width,
        fps: format.fps,
        bitrate: format.bitrate,
        contentLength: format.contentLength,
        hasVideo,
        hasAudio,
        codecs,
        audioQuality: format.audioQuality,
      } satisfies VideoStreamFormat;
    })
    .filter((format) => Boolean(format.url));
}

export type PlayerData = {
  videoId: string;
  playable: boolean;
  reason?: string;
  streams: StreamInfo | null;
  captions: CaptionTrack[];
  chapters: { title: string; startSeconds: number }[];
  details: {
    title?: string;
    author?: string;
    channelId?: string;
    viewCount?: number;
    durationSeconds?: number;
    isLive?: boolean;
    description?: string;
  };
  client: string;
};

/**
 * Fetch stream metadata for a video.
 *
 * Video bytes are NEVER proxied: we return signed googlevideo URLs and the
 * client plays them directly. If unlocking fails (bot wall, missing PO token,
 * signature change) we return `playable: false` with a reason so the UI can fall
 * back to the official embed player.
 */
export async function getPlayerData(videoId: string): Promise<PlayerData> {
  const cacheKeyId = cacheKey("player", videoId, process.env.INNERTUBE_REGION);
  return cached(cacheKeyId, 1800, async () => {
    // Signed-in callers are served by the TV client (the one our OAuth token
    // belongs to); anonymous callers get the Android/iOS-first rotation because
    // those contexts hand out plain progressive URLs when YouTube allows them.
    const signedIn = Boolean(await getValidAccessToken().catch(() => null));
    const { data, client, usedAuth } = await innertube({
      endpoint: "player",
      body: { videoId, contentCheckOk: true, racyCheckOk: true },
      ttl: 0,
      clients: signedIn ? ["TVHTML5", "ANDROID", "IOS", "WEB"] : ["ANDROID", "IOS", "TVHTML5", "WEB"],
      authenticated: true,
    });

    const parsed = parseOrThrow(playerResponse, data, "player");
    const status = parsed.playabilityStatus;
    const details = parsed.videoDetails;
    const playable = status?.status === "OK" || status?.status === "LIVE_STREAM_OFFLINE";

    const base = {
      videoId,
      playable: Boolean(playable),
      reason: status && status.status !== "OK" ? [status.reason, text(status.subreason)].filter(Boolean).join(" - ") : undefined,
      captions: [] as CaptionTrack[],
      chapters: chaptersFromAny(data as J),
      details: {
        title: details?.title,
        author: details?.author,
        channelId: details?.channelId,
        viewCount: details?.viewCount ? Number(details.viewCount) : undefined,
        durationSeconds: details?.lengthSeconds ? Number(details.lengthSeconds) : undefined,
        isLive: details?.isLiveContent,
        description: details?.shortDescription,
      },
      client,
      streams: null as StreamInfo | null,
    };

    if (!playable) {
      // Redacted diagnostic: which client answered, with what verdict, and the
      // first few words of YouTube's own reason. No cookies, no tokens, no URLs.
      console.warn(
        JSON.stringify({
          scope: "player",
          videoId,
          client,
          auth: usedAuth ? "signed-in" : "anonymous",
          status: status?.status ?? "unknown",
          reason: String(base.reason ?? "").slice(0, 120),
        }),
      );
      return base;
    }

    const captions: CaptionTrack[] =
      parsed.captions?.playerCaptionsTracklistRenderer?.captionTracks?.map((track) => ({
        language: track.languageCode,
        label: text(track.name) ?? track.languageCode,
        baseUrl: track.baseUrl,
        isAutomatic: track.kind === "asr",
      })) ?? [];

    const playerJs = await getPlayerJs();
    const context: UnlockContext = createUnlockContext(playerJs);

    const rawFormats: StreamingFormat[] = [
      ...(parsed.streamingData?.formats ?? []),
      ...(parsed.streamingData?.adaptiveFormats ?? []),
    ];

    const unlocked: StreamingFormat[] = [];
    for (const raw of rawFormats) {
      const validated = streamingFormat.safeParse(raw);
      if (!validated.success) continue;
      const url = unlockUrl(validated.data, context);
      if (!url) continue;
      unlocked.push({ ...validated.data, url });
    }

    const formats = classify(unlocked);
    const expiresIn = Number(parsed.streamingData?.expiresInSeconds ?? 0);

    if (!formats.length) {
      console.warn(
        JSON.stringify({
          scope: "player",
          videoId,
          client,
          auth: usedAuth ? "signed-in" : "anonymous",
          status: "NO_FORMATS",
          reason: "streamingData returned no usable URL (PO token or SABR-only response)",
        }),
      );
      return { ...base, captions, playable: false, streams: null };
    }

    return {
      ...base,
      captions,
      streams: {
        formats,
        expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
        hlsManifestUrl: parsed.streamingData?.hlsManifestUrl,
        dashManifestUrl: parsed.streamingData?.dashManifestUrl,
      },
    };
  });
}

/** Ordered playing options: muxed first (simplest), then adaptive video tracks. */
export function pickQualityOptions(formats: VideoStreamFormat[]): VideoStreamFormat[] {
  const withVideo = formats.filter((f) => f.hasVideo && f.height);
  const muxed = withVideo.filter((f) => f.hasAudio);
  const source = muxed.length ? muxed : withVideo;
  const seen = new Set<number>();
  return source
    .filter((format) => {
      const key = format.height ?? 0;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
}

export function pickAudio(formats: VideoStreamFormat[]): VideoStreamFormat | undefined {
  return formats
    .filter((f) => f.hasAudio && !f.hasVideo)
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
}

/** Merge the watch-page details with the player payload into one response. */
export async function getVideoBundle(videoId: string) {
  const [player, watch] = await Promise.all([
    getPlayerData(videoId),
    (await import("./next")).getWatchNext(videoId).catch(() => null),
  ]);
  return { player, watch };
}

/**
 * Browsers are picky: Safari only plays H.264/AAC in MP4, Chrome handles VP9
 * and AV1 but chokes on some Dolby audio, and every platform plays progressive
 * MP4. So we rank by "can this container actually play here" instead of just
 * taking the highest bitrate.
 */
export function formatRank(format: VideoStreamFormat): number {
  const codecs = (format.codecs ?? "").toLowerCase();
  const mime = format.mimeType.toLowerCase();
  let rank = 0;
  if (codecs.startsWith("avc1")) rank += 100;
  else if (codecs.startsWith("vp9") || codecs.startsWith("vp09")) rank += 60;
  else if (codecs.startsWith("av01")) rank += 40;
  if (mime.includes("mp4")) rank += 30;
  if (format.hasAudio) rank += 20;
  rank += Math.min(20, (format.height ?? 0) / 100);
  return rank;
}

/** Pick the best format a browser can play, preferring muxed (no audio sync dance). */
export function pickBrowserFormat(formats: VideoStreamFormat[], wantedHeight?: number): VideoStreamFormat | undefined {
  const video = formats.filter((f) => f.hasVideo && f.url);
  if (!video.length) return undefined;
  const pool = wantedHeight
    ? video.filter((f) => Math.abs((f.height ?? 0) - wantedHeight) <= 120)
    : video;
  const candidates = pool.length ? pool : video;
  return [...candidates].sort((a, b) => formatRank(b) - formatRank(a))[0];
}
