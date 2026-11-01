/**
 * Tolerant renderer walker.
 *
 * YouTube mixes legacy renderers (videoRenderer, compactVideoRenderer) with the
 * newer view-model payloads (lockupViewModel, videoWithContextRenderer) and
 * reshuffles them regularly. Instead of hard-coding paths, we walk the tree and
 * map every node we recognise. That keeps the app alive across schema churn.
 */
import type { Thumbnail, VideoKind, VideoSummary } from "../types";
import { normalizeThumbUrl, parseCountLabel, parseDurationText } from "@/lib/utils/format";

export type J = Record<string, any>;

export function isObj(value: unknown): value is J {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Any of: string | {simpleText} | {runs:[{text}]} | {content} | {text} */
export function text(node: unknown): string | undefined {
  if (!node) return undefined;
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    const parts = node.map((n) => text(n)).filter(Boolean) as string[];
    return parts.length ? parts.join("") : undefined;
  }
  if (!isObj(node)) return undefined;
  if (typeof node.simpleText === "string") return node.simpleText;
  if (typeof node.content === "string") return node.content;
  if (Array.isArray(node.runs)) {
    const joined = node.runs.map((r: any) => (typeof r?.text === "string" ? r.text : "")).join("");
    return joined || undefined;
  }
  if (node.text !== undefined && node.text !== node) return text(node.text);
  if (node.title !== undefined) return text(node.title);
  if (node.headline !== undefined) return text(node.headline);
  return undefined;
}

export function thumbnails(node: any): Thumbnail[] {
  if (!node) return [];
  const list: any[] =
    node.thumbnails ??
    node.sources ??
    node.image?.sources ??
    node.thumbnail?.thumbnails ??
    node.thumbnailViewModel?.image?.sources ??
    node.avatar?.avatarViewModel?.image?.sources ??
    node.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources ??
    [];
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => typeof t?.url === "string")
    .map((t) => ({
      url: normalizeThumbUrl(t.url),
      width: typeof t.width === "number" ? t.width : undefined,
      height: typeof t.height === "number" ? t.height : undefined,
    }));
}

/** Depth-first walk over every object node. */
export function deepWalk(root: unknown, visit: (node: J) => void): void {
  const stack: unknown[] = [root];
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      // Push in reverse so children are popped in document order.
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    if (!isObj(node)) continue;
    visit(node);
    const values = Object.values(node);
    for (let i = values.length - 1; i >= 0; i--) {
      const value = values[i];
      if (isObj(value) || Array.isArray(value)) stack.push(value);
    }
  }
}

export function findAll(root: unknown, key: string): J[] {
  const found: J[] = [];
  deepWalk(root, (node) => {
    const value = node[key];
    if (isObj(value)) found.push(value);
  });
  return found;
}

export function findByKey(root: unknown, key: string): J | undefined {
  let found: J | undefined;
  deepWalk(root, (node) => {
    if (!found && isObj(node[key])) found = node[key] as J;
  });
  return found;
}

/** First continuation token anywhere in a payload. */
export function findContinuation(root: unknown, sectionHint?: string): string | undefined {
  let token: string | undefined;
  let hinted: string | undefined;
  deepWalk(root, (node) => {
    const itemSection = node.itemSectionRenderer;
    if (isObj(itemSection)) {
      const isHint = sectionHint ? itemSection.sectionIdentifier === sectionHint : false;
      const cont = findAll(itemSection, "continuationCommand")[0];
      if (isHint && typeof cont?.token === "string") hinted = cont.token;
    }
    const direct = findAll(node, "continuationCommand")[0];
    if (!token && typeof direct?.token === "string") token = direct.token;
  });
  return hinted ?? token;
}

function channelFromNode(node: J): { name: string; id?: string; handle?: string; avatar?: Thumbnail[]; verified?: boolean } {
  const ownerRun = node.ownerText?.runs?.[0] ?? node.longBylineText?.runs?.[0];
  const bylineRun = node.shortBylineText?.runs?.[0];
  const name =
    text(ownerRun) ??
    text(bylineRun) ??
    text(node.videoOwnerRenderer?.title) ??
    text(node.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text) ??
    "";
  const endpoint =
    ownerRun?.navigationEndpoint?.browseEndpoint ??
    bylineRun?.navigationEndpoint?.browseEndpoint ??
    node.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint;
  const avatarSources =
    node.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail ??
    node.videoOwnerRenderer?.thumbnail ??
    node.metadata?.lockupMetadataViewModel?.image;
  return {
    name: name.replace(/\s+/g, " ").trim(),
    id: endpoint?.browseId ?? node.videoOwnerRenderer?.navigationEndpoint?.browseEndpoint?.browseId,
    handle: endpoint?.canonicalBaseUrl?.startsWith("/@")
      ? endpoint.canonicalBaseUrl.slice(1)
      : undefined,
    avatar: thumbnails(avatarSources),
    verified: Boolean(
      node.ownerBadges?.some?.(
        (b: any) => b?.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_VERIFIED",
      ),
    ),
  };
}

function kindFromBadges(badges: any[], isShort: boolean): VideoKind {
  const labels = badges
    .map((b) => text(b?.metadataBadgeRenderer?.label ?? b?.thumbnailBadgeViewModel?.text))
    .filter(Boolean)
    .map((l) => String(l).toUpperCase());
  if (labels.some((l) => l.includes("LIVE"))) return "live";
  if (labels.some((l) => l.includes("UPCOMING") || l.includes("PREMIERE"))) return "upcoming";
  return isShort ? "short" : "video";
}

function summaryFromLegacy(renderer: J, isShort = false): VideoSummary | undefined {
  const id = renderer.videoId;
  if (typeof id !== "string" || !id) return undefined;
  const title = text(renderer.title) ?? text(renderer.headline);
  if (!title) return undefined;
  const durationText = text(renderer.lengthText);
  const viewCountText =
    text(renderer.viewCountText) ??
    text(renderer.shortViewCountText) ??
    text(renderer.videoInfo);
  const badges: any[] = renderer.badges ?? renderer.thumbnailOverlays ?? [];
  return {
    id,
    kind: kindFromBadges(badges, isShort),
    title,
    thumbnails: thumbnails(renderer.thumbnail ?? renderer.richThumbnail),
    channel: channelFromNode(renderer),
    durationSeconds: parseDurationText(durationText),
    durationText,
    viewCountText,
    views: parseCountLabel(viewCountText),
    publishedText: text(renderer.publishedTimeText),
    description: text(renderer.descriptionSnippet),
  };
}

/** New-style lockupViewModel (search results, related rail, channel shelves). */
function summaryFromLockup(lockup: J): VideoSummary | undefined {
  const contentType: string = lockup.contentType ?? "";
  if (contentType && !/VIDEO|SHORTS|LIVE|CLIP/.test(contentType)) return undefined;
  const id: string | undefined = lockup.contentId;
  if (!id) return undefined;
  const meta = lockup.metadata?.lockupMetadataViewModel;
  const title = text(meta?.title);
  if (!title) return undefined;

  const overlayBadges = findAll(lockup.contentImage, "thumbnailBadgeViewModel");
  const durationBadge = overlayBadges
    .map((b) => text(b.text))
    .find((t) => t && /^\d+(:\d+)+$/.test(t));
  const isLive = overlayBadges.some((b) => (text(b.text) ?? "").toUpperCase() === "LIVE");

  const rows: any[] = meta?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
  const parts: string[] = rows
    .flatMap((row: any) => row.metadataParts ?? [])
    .map((part: any) => text(part?.text))
    .filter((v: unknown): v is string => typeof v === "string");
  const viewPart = parts.find((p) => /view|watching|waiting/i.test(p));
  const datePart = parts.find((p) => /ago|Streamed|Premier/i.test(p));

  const avatarSources = meta?.image;
  const a11y: string | undefined = meta?.image?.decoratedAvatarViewModel?.a11yLabel;
  const channelName =
    parts[0] && !/view|ago|watching/i.test(parts[0])
      ? parts[0]
      : (a11y?.replace(/^Go to channel\s*/i, "") ?? "");

  const browse = findAll(lockup, "browseEndpoint").find((b) => String(b.browseId ?? "").startsWith("UC"));

  return {
    id,
    kind: isLive ? "live" : contentType.includes("SHORTS") ? "short" : "video",
    title,
    thumbnails: thumbnails(lockup.contentImage),
    channel: {
      name: channelName,
      id: browse?.browseId,
      handle: typeof browse?.canonicalBaseUrl === "string" ? browse.canonicalBaseUrl.replace(/^\//, "") : undefined,
      avatar: thumbnails(avatarSources),
    },
    durationSeconds: parseDurationText(durationBadge),
    durationText: durationBadge,
    viewCountText: viewPart,
    views: parseCountLabel(viewPart),
    publishedText: datePart,
  };
}

function summaryFromShortsLockup(node: J): VideoSummary | undefined {
  const id: string | undefined = node.entityId?.replace(/^shorts-shelf-item-/, "") ?? node.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
  const title = text(node.overlayMetadata?.primaryText) ?? text(node.accessibilityText);
  if (!id || !title) return undefined;
  const secondary = text(node.overlayMetadata?.secondaryText);
  return {
    id,
    kind: "short",
    title,
    thumbnails: thumbnails(node.thumbnail ?? node.thumbnailViewModel),
    channel: { name: "" },
    viewCountText: secondary,
    views: parseCountLabel(secondary),
  };
}

const KNOWN_RENDERER_KEYS = [
  "videoRenderer",
  "compactVideoRenderer",
  "gridVideoRenderer",
  "playlistVideoRenderer",
  "videoWithContextRenderer",
  "playlistPanelVideoRenderer",
] as const;

/** Collect unique videos from anywhere in a payload, preserving document order. */
export function collectVideos(root: unknown): VideoSummary[] {
  const out: VideoSummary[] = [];
  const seen = new Set<string>();
  const push = (video: VideoSummary | undefined) => {
    if (!video || seen.has(video.id)) return;
    seen.add(video.id);
    out.push(video);
  };
  deepWalk(root, (node) => {
    for (const key of KNOWN_RENDERER_KEYS) {
      if (isObj(node[key])) push(summaryFromLegacy(node[key] as J, false));
    }
    if (isObj(node.reelItemRenderer)) push(summaryFromLegacy(node.reelItemRenderer as J, true));
    if (isObj(node.shortsLockupViewModel)) push(summaryFromShortsLockup(node.shortsLockupViewModel as J));
    if (isObj(node.lockupViewModel)) push(summaryFromLockup(node.lockupViewModel as J));
  });
  return out;
}

/** Dedupe helper for merge functions (keeps the first occurrence). */
export function mergeVideos(...lists: VideoSummary[][]): VideoSummary[] {
  const seen = new Set<string>();
  const out: VideoSummary[] = [];
  for (const list of lists) {
    for (const video of list) {
      if (seen.has(video.id)) continue;
      seen.add(video.id);
      out.push(video);
    }
  }
  return out;
}
