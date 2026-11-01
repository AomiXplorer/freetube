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
import { getValidAccessToken } from "@/lib/auth/tokens";
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

/**
 * Credentials attached to a request.
 *  - bearer: an OAuth token from the TV device flow (best coverage; bypasses
 *    the signed-out bot wall for that user).
 *  - cookie: a pasted youtube.com cookie header (SAPISIDHASH auth).
 */
type Auth = { bearer: string | null; cookie: string | null; id: string | null };

const NO_AUTH: Auth = { bearer: null, cookie: null, id: null };

/**
 * Short, one-way fingerprint of the credential.
 *
 * The cache is shared per deployment, so a personalised feed must never share a
 * key with the signed-out one (or with another account). The fingerprint is a
 * truncated SHA-256: it discriminates accounts without exposing the secret.
 */
async function fingerprint(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest))
    .slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function resolveAuth(authenticated: boolean | undefined): Promise<Auth> {
  if (!authenticated) return NO_AUTH;
  const bearer = await getValidAccessToken().catch(() => null);
  if (bearer) return { bearer, cookie: null, id: await fingerprint(bearer) };
  const cookie = await getSessionCookies().catch(() => null);
  if (!cookie) return NO_AUTH;
  return { bearer: null, cookie, id: await fingerprint(cookie) };
}

export function hasAuth(auth: Auth): boolean {
  return Boolean(auth.bearer ?? auth.cookie);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function buildHeaders(client: ClientContext, auth: Auth): Promise<HeadersInit> {
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
  if (auth.bearer) {
    headers.Authorization = `Bearer ${auth.bearer}`;
    headers["X-Goog-AuthUser"] = "0";
  } else if (auth.cookie) {
    headers.Cookie = auth.cookie;
    const hash = await sapisidHash(auth.cookie);
    if (hash) headers.Authorization = hash;
    headers["X-Goog-AuthUser"] = "0";
  }
  return headers;
}

function buildBody(client: ClientContext, body: Json, auth: Auth): Json {
  const context: Json = {
    client: {
      ...client.body,
      ...(process.env.YT_VISITOR_DATA ? { visitorData: process.env.YT_VISITOR_DATA } : {}),
    },
  };
  if (hasAuth(auth)) {
    context.user = { lockedSafetyMode: false };
    context.request = { useSsl: true, internalExperimentFlags: [] };
  }
  return { context, ...body };
}

async function attempt(
  options: RequestOptions,
  clientName: ClientName,
  auth: Auth,
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
  const auth = await resolveAuth(options.authenticated);
  const authMode = auth.bearer ? "bearer" : auth.cookie ? "cookie" : "anon";
  const key = cacheKey(
    "it",
    options.endpoint,
    options.cacheTag,
    auth.id ? `${authMode}:${auth.id}` : authMode,
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
          return { data, client: clientName, usedAuth: hasAuth(auth) };
        } catch (error) {
          lastError = error;
          const status = (error as { status?: number }).status;
          // 400s are structural (bad params) - retrying the same client is pointless.
          if (status === 400) break;
          await sleep(220 * Math.pow(2, tryIndex) + index * 120);
        }
      }
    }
    // One structured, redacted line per failure: enough to diagnose a break,
    // never enough to leak a cookie or a token.
    console.warn(
      JSON.stringify({
        scope: "innertube",
        endpoint: options.endpoint,
        cacheTag: options.cacheTag,
        auth: auth.bearer ? "bearer" : auth.cookie ? "cookie" : "anon",
        clients: clients.join(","),
        error: lastError instanceof Error ? lastError.message : "unknown",
      }),
    );
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
