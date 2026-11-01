/**
 * YouTube TV OAuth 2.0 device flow.
 *
 * Why this flow: InnerTube's TV client accepts an OAuth token, and a signed-in
 * request is not subject to the "confirm you're not a bot" wall that anonymous
 * requests from datacenter IPs hit. Google never sees a password from us - the
 * user types it on google.com/device, on Google's own page. We only ever
 * receive an access/refresh token.
 *
 * The client id/secret below identify the YouTube TV (Cobalt) application and
 * are the long-public values bundled with open-source TV clients. They are not
 * this project's credentials and grant nothing on their own; a token only
 * exists after a user approves this device code with their own account.
 * Override with YT_OAUTH_CLIENT_ID / YT_OAUTH_CLIENT_SECRET if needed.
 */
export const DEVICE_CODE_URL = "https://www.youtube.com/o/oauth2/device/code";
export const TOKEN_URL = "https://www.youtube.com/o/oauth2/token";
export const OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube";

const CLIENT_ID =
  process.env.YT_OAUTH_CLIENT_ID ??
  "861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com";
const CLIENT_SECRET = process.env.YT_OAUTH_CLIENT_SECRET ?? "SboVhoG9s0rNafixCSGGKXAT";

export type DeviceStart = {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
  intervalSeconds: number;
};

export type TokenBundle = {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. Tokens live 60 minutes. */
  expiresAt: number;
  scope?: string;
};

export type Profile = {
  name?: string;
  channelId?: string;
  avatar?: string;
};

export type PollResult =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "expired" }
  | { status: "denied"; message?: string }
  | { status: "ok"; tokens: TokenBundle };

/** Refresh a minute early so a request never races the expiry. */
export const REFRESH_WINDOW_MS = 60_000;

export function needsRefresh(tokens: Pick<TokenBundle, "expiresAt">, now = Date.now()): boolean {
  return tokens.expiresAt - REFRESH_WINDOW_MS <= now;
}

/** Turn a Google token response into our stored bundle. */
export function tokenBundleFromResponse(
  json: Record<string, unknown>,
  previous?: Pick<TokenBundle, "refreshToken">,
  now = Date.now(),
): TokenBundle | null {
  const accessToken = typeof json.access_token === "string" ? json.access_token : null;
  if (!accessToken) return null;
  const expiresIn = Number(json.expires_in);
  const refreshToken =
    typeof json.refresh_token === "string" ? json.refresh_token : previous?.refreshToken;
  return {
    accessToken,
    refreshToken,
    expiresAt: now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}

/** Map a device-flow error body onto the states the UI needs to show. */
export function classifyPollError(code: string | undefined): PollResult {
  switch (code) {
    case "authorization_pending":
      return { status: "pending" };
    case "slow_down":
      return { status: "slow_down" };
    case "expired_token":
      return { status: "expired" };
    case "access_denied":
      return { status: "denied", message: "Access was denied on the Google consent screen." };
    default:
      return { status: "denied", message: code ?? "unknown_error" };
  }
}

export async function startDeviceFlow(): Promise<DeviceStart> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: OAUTH_SCOPE }),
    cache: "no-store",
  });
  const json = (await res.json()) as Record<string, unknown>;
  const deviceCode = typeof json.device_code === "string" ? json.device_code : null;
  const userCode = typeof json.user_code === "string" ? json.user_code : null;
  if (!res.ok || !deviceCode || !userCode) {
    throw new Error(`device_start_failed:${String(json.error ?? res.status)}`);
  }
  const expiresIn = Number(json.expires_in) || 1800;
  const interval = Number(json.interval) || 5;
  return {
    deviceCode,
    userCode,
    verificationUrl:
      typeof json.verification_url === "string" ? json.verification_url : "https://www.google.com/device",
    expiresAt: Date.now() + expiresIn * 1000,
    intervalSeconds: interval,
  };
}

export async function pollDeviceFlow(deviceCode: string): Promise<PollResult> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (res.ok && typeof json.access_token === "string") {
    const tokens = tokenBundleFromResponse(json);
    if (tokens) return { status: "ok", tokens };
  }
  return classifyPollError(typeof json.error === "string" ? json.error : undefined);
}

export async function refreshTokens(
  refreshToken: string,
  previous?: Pick<TokenBundle, "refreshToken">,
): Promise<TokenBundle | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, unknown>;
  return tokenBundleFromResponse(json, { refreshToken: previous?.refreshToken ?? refreshToken });
}

/** Read the signed-in channel from InnerTube (name + avatar only). */
export async function fetchProfile(accessToken: string): Promise<Profile | null> {
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/account/account_menu?prettyPrint=false", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        origin: "https://www.youtube.com",
        "user-agent": "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.1",
        "x-youtube-client-name": "7",
        "x-youtube-client-version": "7.20240724.13.00",
      },
      body: JSON.stringify({
        context: { client: { clientName: "TVHTML5", clientVersion: "7.20240724.13.00", hl: "en", gl: "US" } },
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    const name = /"accountName":\{"simpleText":"([^"]+)"/.exec(text)?.[1];
    const channelId = /"channelId":"(UC[\w-]+)"/.exec(text)?.[1];
    const avatar = /"(https:\/\/yt3\.[^"]+?)"/.exec(text)?.[1];
    return { name, channelId, avatar };
  } catch {
    return null;
  }
}
