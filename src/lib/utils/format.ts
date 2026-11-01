/** Parse "1,832,421,778 views" / "1.8M views" / "12K subscribers" into a number. */
export function parseCountLabel(label?: string | null): number | undefined {
  if (!label) return undefined;
  const m = label.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return undefined;
  const value = Number.parseFloat(m[1]);
  if (Number.isNaN(value)) return undefined;
  const suffix = (m[2] ?? "").toUpperCase();
  const mult = suffix === "K" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : 1;
  return Math.round(value * mult);
}

/** "1:02:03" / "4:20" -> seconds */
export function parseDurationText(text?: string | null): number | undefined {
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Number(text);
  const parts = text.split(":").map((p) => Number.parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return undefined;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function formatDuration(totalSeconds?: number | null): string {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return "";
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** 1832421778 -> "1.8B views" */
export function formatViews(count?: number | null): string | undefined {
  if (count == null) return undefined;
  if (count >= 1e9) return `${(count / 1e9).toFixed(count % 1e9 === 0 ? 0 : 1)}B views`;
  if (count >= 1e6) return `${(count / 1e6).toFixed(count % 1e6 === 0 ? 0 : 1)}M views`;
  if (count >= 1e3) return `${(count / 1e3).toFixed(0)}K views`;
  return `${count} views`;
}

export function timeAgo(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return undefined;
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Turn any thumbnail list into the best available URL. */
export function bestThumb<T extends { url: string; width?: number; height?: number }>(
  thumbs?: T[] | null,
): string | undefined {
  if (!thumbs?.length) return undefined;
  const sorted = [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const url = sorted[0]?.url;
  return url ? normalizeThumbUrl(url) : undefined;
}

export function normalizeThumbUrl(raw: string): string {
  let url = raw.startsWith("//") ? `https:${raw}` : raw;
  url = url.replace(/=s\d+.*$/, "");
  return url;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
