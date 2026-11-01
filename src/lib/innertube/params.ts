/**
 * Minimal protobuf writer for YouTube search filters.
 *
 * Verified against the encodings YouTube's own UI emits:
 *   sort upload date  -> CAPI           (field 1 varint 2)
 *   type video        -> EgIQAQ==       (filters.field 2 varint 1)
 *   duration short    -> EgIYAQ==       (filters.field 3 varint 1)
 *   upload today      -> EgIIAg==       (filters.field 1 varint 2)
 * Combining them needs a real message, which is what this builds.
 */

export type SearchSort = "relevance" | "rating" | "date" | "views";
export type SearchType = "all" | "video" | "channel" | "playlist" | "movie";
export type SearchDuration = "any" | "short" | "medium" | "long";
export type SearchUploadDate = "any" | "hour" | "today" | "week" | "month" | "year";

export type SearchFilters = {
  sort?: SearchSort;
  type?: SearchType;
  duration?: SearchDuration;
  uploadDate?: SearchUploadDate;
  /** 4K / HD / subtitles / live / creative commons flags */
  features?: ("hd" | "4k" | "subtitles" | "live" | "creativeCommons" | "360" | "vr180" | "3d" | "hdr")[];
};

const SORT: Record<SearchSort, number> = { relevance: 0, rating: 1, date: 2, views: 3 };
const TYPE: Record<Exclude<SearchType, "all">, number> = {
  video: 1,
  channel: 2,
  playlist: 3,
  movie: 4,
};
const DURATION: Record<Exclude<SearchDuration, "any">, number> = { short: 1, long: 2, medium: 3 };
const UPLOAD: Record<Exclude<SearchUploadDate, "any">, number> = {
  hour: 1,
  today: 2,
  week: 3,
  month: 4,
  year: 5,
};
/** Filters field numbers for boolean feature toggles. */
const FEATURE_FIELD: Record<string, number> = {
  hd: 4,
  subtitles: 5,
  creativeCommons: 6,
  "3d": 7,
  live: 8,
};

function varint(value: number): number[] {
  const bytes: number[] = [];
  let v = value;
  while (v > 127) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return bytes;
}

function tag(field: number, wireType: number): number[] {
  return varint((field << 3) | wireType);
}

function fieldVarint(field: number, value: number): number[] {
  return [...tag(field, 0), ...varint(value)];
}

function fieldBytes(field: number, payload: number[]): number[] {
  return [...tag(field, 2), ...varint(payload.length), ...payload];
}

function base64UrlEncode(bytes: number[]): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildSearchParams(filters: SearchFilters): string | undefined {
  const filterBytes: number[] = [];

  if (filters.uploadDate && filters.uploadDate !== "any") {
    filterBytes.push(...fieldVarint(1, UPLOAD[filters.uploadDate]));
  }
  if (filters.type && filters.type !== "all") {
    filterBytes.push(...fieldVarint(2, TYPE[filters.type]));
  }
  if (filters.duration && filters.duration !== "any") {
    filterBytes.push(...fieldVarint(3, DURATION[filters.duration]));
  }
  for (const feature of filters.features ?? []) {
    const fieldNumber = FEATURE_FIELD[feature];
    if (fieldNumber) filterBytes.push(...fieldVarint(fieldNumber, 1));
  }

  const body: number[] = [];
  const sort = filters.sort && filters.sort !== "relevance" ? SORT[filters.sort] : 0;
  if (sort) body.push(...fieldVarint(1, sort));
  if (filterBytes.length) body.push(...fieldBytes(2, filterBytes));
  if (!body.length) return undefined;
  return encodeURIComponent(base64UrlEncode(body));
}

/** Decode a params string back into an inspectable object (used by tests). */
export function decodeParamsRaw(params: string): { sort?: number; filters?: Record<string, number> } {
  const bytes = Array.from(atob(decodeURIComponent(params)), (c) => c.charCodeAt(0));
  const out: { sort?: number; filters?: Record<string, number> } = {};
  let i = 0;
  const readVarint = (): number => {
    let result = 0;
    let shift = 0;
    while (i < bytes.length) {
      const byte = bytes[i++] as number;
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  };
  while (i < bytes.length) {
    const key = readVarint();
    const field = key >> 3;
    const wire = key & 7;
    if (wire === 0) {
      const value = readVarint();
      if (field === 1) out.sort = value;
    } else if (wire === 2) {
      const length = readVarint();
      const payload = bytes.slice(i, i + length);
      i += length;
      if (field === 2) {
        out.filters = {};
        let j = 0;
        while (j < payload.length) {
          let shift = 0;
          let inner = 0;
          while (j < payload.length) {
            const byte = payload[j++] as number;
            inner |= (byte & 0x7f) << shift;
            if ((byte & 0x80) === 0) break;
            shift += 7;
          }
          const innerField = inner >> 3;
          const innerWire = inner & 7;
          if (innerWire === 0) {
            let v = 0;
            let s = 0;
            while (j < payload.length) {
              const byte = payload[j++] as number;
              v |= (byte & 0x7f) << s;
              if ((byte & 0x80) === 0) break;
              s += 7;
            }
            out.filters[String(innerField)] = v;
          } else break;
        }
      }
    } else break;
  }
  return out;
}
