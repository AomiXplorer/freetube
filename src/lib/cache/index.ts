/**
 * Cache abstraction.
 *
 * Uses Upstash Redis REST (also compatible with Vercel KV REST credentials)
 * when env vars are present, otherwise a bounded in-memory map. Everything is
 * fetch-based so it works on both the Edge and Node runtimes.
 */

type Entry = { value: unknown; expiresAt: number };

const MEMORY = new Map<string, Entry>();
const MAX_ENTRIES = 500;

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export const cacheBackend: "redis" | "memory" = REDIS_URL && REDIS_TOKEN ? "redis" : "memory";

function memorySet(key: string, value: unknown, ttlMs: number) {
  if (MEMORY.size >= MAX_ENTRIES) {
    const oldest = MEMORY.keys().next().value;
    if (oldest) MEMORY.delete(oldest);
  }
  MEMORY.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function memoryGet<T>(key: string): T | undefined {
  const hit = MEMORY.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    MEMORY.delete(key);
    return undefined;
  }
  return hit.value as T;
}

async function redisCommand<T>(command: unknown[]): Promise<T | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(REDIS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: T };
    return json.result ?? null;
  } catch {
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  if (cacheBackend === "redis") {
    const raw = await redisCommand<string>(["GET", key]);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }
  return memoryGet<T>(key);
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (cacheBackend === "redis") {
    await redisCommand(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
    return;
  }
  memorySet(key, value, ttlSeconds * 1000);
}

/** Wrap a producer with read-through caching. Never throws because of the cache. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await producer();
  if (value !== undefined && value !== null) {
    await cacheSet(key, value, ttlSeconds);
  }
  return value;
}

export function cacheKey(...parts: (string | number | undefined | null)[]): string {
  return ["ft", ...parts.filter((p) => p !== undefined && p !== null && p !== "")].join(":");
}
