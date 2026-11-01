/**
 * Low-level InnerTube transport.
 *
 * Responsibilities:
 *  - build a realistic request (context + headers + optional session cookies)
 *  - retry with exponential backoff and rotate client contexts on failure
 *  - validate the response shape with Zod
 *  - read-through cache so one page render never fans out to YouTube twice
 *
 * Every endpoint module in ./endpoints goes through this one function, so the
 * transport can be swapped without touching parsers or routes.
 */
import { cached, cacheKey } from "@/lib/cache";
import { getSessionCookies } from "@/lib/auth/session";
import { sapisidHash } from "@/lib/auth/sapisid";
import { CLIENT_ROTATION, CLIENTS, type ClientContext, type ClientName } from "./contexts";
import { innerTubeEnvelope, parseOrThrow } from "./schema";

const API_BASE = "https://www.youtube.com/youtubei/v1";

export type Json = Record<string, unknown>;

export type RequestOptions = {
  endpoint: string;
  body?: Json;
  /** Client preference order. Defaults to the browse rotation. */
  clients?: ClientName[];
  /** Cache TTL in seconds. 0 disables caching. */
  ttl?: number;
  /** Extra cache-key discriminator (query, browseId, continuation, ...). */
  cacheTag?: string;
  /** Use the caller's sealed session cookies when present. */
  authenticated?: boolean;
  timeoutMs?: number;
};

export type InnerTubeResult = {
  data: Json;
  client: ClientName;
  usedAuth: boolean;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function buildHeaders(client: ClientContext, auth: string | null): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": client.userAgent,
    "X-Youtube-Client-Name": client.headerName,
    "X-Youtube-Client-Version": client.version,
    "Accept-Language": `${process.env.INNERTUBE_LANGUAGE ?? "en"}-${process.env.INNERTUBE_LANGUAGE ?? "en"};q=0.9`,
    Origin: "https://www.youtube.com",
    Referer: "https://www.youtube.com/",
  };
  if (client.name === "ANDROID" || client.name === "IOS") {
    headers["X-Goog-Api-Format-Version"] = "2";
  }
  if (auth) {
    headers.Cookie = auth;
    const hash = await sapisidHash(auth);
    if (hash) headers.Authorization = hash;
    headers["X-Goog-AuthUser"] = "0";
  }
  return headers;
}

function buildBody(client: ClientContext, body: Json, auth: string | null): Json {
  const context: Json = {
    client: {
      ...client.body,
      ...(process.env.YT_VISITOR_DATA ? { visitorData: process.env.YT_VISITOR_DATA } : {}),
    },
  };
  if (auth) {
    context.user = { lockedSafetyMode: false };
    context.request = { useSsl: true, internalExperimentFlags: [] };
  }
  return { context, ...body };
}

async function attempt(
  options: RequestOptions,
  clientName: ClientName,
  auth: string | null,
): Promise<Json> {
  const client = CLIENTS[clientName];
  const url = `${API_BASE}/${options.endpoint}?key=${client.apiKey}&prettyPrint=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: await buildHeaders(client, auth),
      body: JSON.stringify(buildBody(client, options.body ?? {}, auth)),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const error = new Error(`InnerTube ${options.endpoint} HTTP ${res.status}`) as Error & {
        status?: number;
      };
      error.status = res.status;
      throw error;
    }
    const json = (await res.json()) as unknown;
    return parseOrThrow(innerTubeEnvelope, json, options.endpoint) as Json;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Perform an InnerTube request with rotation + backoff + caching.
 * Throws only after every candidate client has failed.
 */
export async function innertube(options: RequestOptions): Promise<InnerTubeResult> {
  const clients =
    options.clients ??
    (options.endpoint === "player" ? CLIENT_ROTATION.player : CLIENT_ROTATION.browse);
  const auth = options.authenticated ? await getSessionCookies() : null;
  const key = cacheKey(
    "it",
    options.endpoint,
    options.cacheTag,
    auth ? "auth" : "anon",
    process.env.INNERTUBE_REGION,
  );
  const ttl = options.ttl ?? 300;

  const run = async (): Promise<InnerTubeResult> => {
    let lastError: unknown;
    for (const [index, clientName] of clients.entries()) {
      // Two tries per client: transient 5xx/network hiccups are common.
      for (let tryIndex = 0; tryIndex < 2; tryIndex++) {
        try {
          const data = await attempt(options, clientName, auth);
          return { data, client: clientName, usedAuth: Boolean(auth) };
        } catch (error) {
          lastError = error;
          const status = (error as { status?: number }).status;
          // 400s are structural (bad params) - retrying the same client is pointless.
          if (status === 400) break;
          await sleep(220 * Math.pow(2, tryIndex) + index * 120);
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("InnerTube request failed");
  };

  if (ttl <= 0) return run();
  return cached(key, ttl, run);
}

/** Raw HTML fetch used for the ytInitialData / player-JS fallback path. */
export async function fetchYouTubeHtml(path: string, authenticated = false): Promise<string> {
  const auth = authenticated ? await getSessionCookies() : null;
  const res = await fetch(`https://www.youtube.com${path}`, {
    headers: {
      "User-Agent": CLIENTS.WEB.userAgent,
      "Accept-Language": "en-US,en;q=0.9",
      ...(auth ? { Cookie: auth } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`YouTube HTML ${path} -> HTTP ${res.status}`);
  return res.text();
}
