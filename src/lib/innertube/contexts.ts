/**
 * InnerTube client contexts.
 *
 * YouTube gates different clients differently from datacenter IPs. We keep
 * several real browser/device contexts and rotate on failure: WEB for
 * metadata (great coverage), ANDROID/IOS for streams (lighter bot checks) and
 * TVHTML5 as a last resort.
 */
export type ClientName = "WEB" | "MWEB" | "ANDROID" | "IOS" | "TVHTML5";

export type ClientContext = {
  name: ClientName;
  apiKey: string;
  version: string;
  headerName: string;
  userAgent: string;
  body: Record<string, unknown>;
};

const REGION = process.env.INNERTUBE_REGION ?? "US";
const LANG = process.env.INNERTUBE_LANGUAGE ?? "en";

/**
 * These are the public InnerTube keys that ship in youtube.com's own JavaScript
 * (visible to every visitor - not secrets of this project). Override them with
 * env vars if a key is ever rotated, and read them from a browser DevTools
 * request if you need to debug a sudden wave of 400s.
 */
const KEYS = {
  web: process.env.YT_KEY_WEB ?? "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  android: process.env.YT_KEY_ANDROID ?? "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
  ios: process.env.YT_KEY_IOS ?? "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
} as const;

const base = { hl: LANG, gl: REGION, utcOffsetMinutes: 0 };

export const CLIENTS: Record<ClientName, ClientContext> = {
  WEB: {
    name: "WEB",
    apiKey: KEYS.web,
    version: "2.20240726.00.00",
    headerName: "1",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    body: { clientName: "WEB", clientVersion: "2.20240726.00.00", ...base },
  },
  MWEB: {
    name: "MWEB",
    apiKey: KEYS.web,
    version: "2.20240726.00.00",
    headerName: "2",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    body: { clientName: "MWEB", clientVersion: "2.20240726.00.00", ...base },
  },
  ANDROID: {
    name: "ANDROID",
    apiKey: KEYS.android,
    version: "19.44.38",
    headerName: "3",
    userAgent: "com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip",
    body: {
      clientName: "ANDROID",
      clientVersion: "19.44.38",
      androidSdkVersion: 34,
      osName: "Android",
      osVersion: "14",
      ...base,
    },
  },
  IOS: {
    name: "IOS",
    apiKey: KEYS.ios,
    version: "19.45.4",
    headerName: "5",
    userAgent: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X)",
    body: {
      clientName: "IOS",
      clientVersion: "19.45.4",
      deviceModel: "iPhone16,2",
      osName: "iPhone",
      osVersion: "18.1.0.22B83",
      ...base,
    },
  },
  TVHTML5: {
    name: "TVHTML5",
    apiKey: KEYS.web,
    version: "7.20240724.13.00",
    headerName: "7",
    userAgent:
      "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version.JavaScriptEnabled Cobalt/25.lts.1 (unlike Gecko) v8/8.8.278.8-jit gles Starboard/17, stsha/25.lts.1",
    body: { clientName: "TVHTML5", clientVersion: "7.20240724.13.00", ...base },
  },
};

/** Order clients are attempted in, per endpoint family. */
export const CLIENT_ROTATION: Record<"browse" | "player", ClientName[]> = {
  browse: ["WEB", "MWEB", "ANDROID"],
  player: ["ANDROID", "IOS", "WEB", "TVHTML5"],
};
