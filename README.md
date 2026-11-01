# Freetube

A fast, installable, privacy-friendly YouTube client.

Built as a **PWA** with Next.js 15 (App Router), React 19, Tailwind + shadcn-style UI, TanStack Query,
Zustand, Dexie and a self-contained InnerTube data layer. It runs entirely on Vercel: no long-running
server, no database, no official API key.

> **Unofficial client.** Freetube is not affiliated with YouTube or Google. Video content is served by
> YouTube; this project only provides a different player/interface. Use it for personal use and respect
> YouTube's Terms of Service and the rights of content owners.

---

## 1. What is implemented

| Area | Status | Notes |
| --- | --- | --- |
| Home feed + category chips + infinite scroll | ✅ | Personalised when cookies are connected, public "Popular right now" fallback otherwise |
| Search (autosuggest, history, filters) | ✅ | Type / duration / upload date / sort via real protobuf params |
| Watch page (player, chapters, like, subscribe, comments + pagination, related) | ✅ | Chapters are clickable, comments stream 20 at a time |
| Channel page (banner, avatar, tabs, videos, Shorts, playlists) | ✅ | Tabs are driven by YouTube's own tab params |
| Shorts (vertical snap feed) | ✅ | Uses the official no-cookie embed (most bot-gated surface) |
| Library: history, playlists, watch later, liked, subscriptions | ✅ | IndexedDB only, never uploaded |
| Player: quality, speed, subtitles, PiP, gestures, sleep timer, keyboard shortcuts | ✅ | See "Player" below |
| SponsorBlock skipping | ✅ | Opt-in in Settings |
| Media Session / background audio | ✅ | Audio-only handoff when the tab hides, full lock-screen controls (play/pause/seek/next/prev), position state |
| Google sign-in (TV device flow) | ✅ | Code + google.com/device, no password ever typed here; access/refresh tokens sealed in httpOnly cookies |
| Mini player | ✅ | Global audio engine, survives navigation, swipe-away, real stop |
| PWA: installable, standalone, offline shell, Windows overlay | ✅ | Serwist service worker + `display_override: window-controls-overlay` |
| Cookie login (advanced fallback) | ✅ | AES-256-GCM sealed httpOnly cookie + SAPISIDHASH |
| Native stream URLs (signature + `n` unlock) | ⚠️ Signed-in only in practice | Anonymous requests from datacenter IPs get the bot wall; signed-in (device flow) requests play natively. Otherwise a silent embed takes over (see §7) |
| Downloads / casting / live chat | ❌ Not implemented | Deliberate scope cut |
| Uploading, commenting, liking on YouTube's side | ❌ Read-only client | Everything user-side is local |

### Player

- HLS via `hls.js` when the response exposes a manifest, progressive `googlevideo` URLs otherwise,
  separate `<audio>` track with drift correction when only adaptive (video-only) formats exist.
- Quality picker, playback speed, captions (`<track>` through a tiny proxy), PiP, fullscreen, theater mode.
- Mobile gestures: double-tap seek (±10s), vertical swipe for volume (left) / brightness (right).
- Keyboard: `Space`/`K` play, `J`/`L` ±10s, `←`/`→` ±5s, `↑`/`↓` volume, `M` mute, `F` fullscreen,
  `T` theater, `C` captions, `I` PiP, `>`/`<` speed, `0-9` seek percent.
- **Background playback.** On `visibilitychange` the player hands the timeline to an audio-only element
  (or to the global audio engine when the video is not on screen), so the screen can be off while sound
  keeps going. Coming back re-seats the video at the audio's position. Nothing pauses on `blur`.
- **Audio only** toggle (player + Settings) and PiP, both reachable on mobile.
- Sleep timer and "background audio" toggle live in **Settings**.

---

## 2. Stack & key technical decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 App Router, React 19, TS strict | Required; RSC keeps the shell fast, client components only where needed |
| Styling | Tailwind + hand-written shadcn/ui primitives | Same tokens/`cn()` conventions, zero Radix bundle cost, fully themed by CSS vars |
| Data layer | Own InnerTube module (`src/lib/innertube`) | One file per endpoint, swap-friendly, Zod-validated at the boundary |
| Transport | `innertube()` with client rotation + jittered backoff | Datacenter IPs are rate-limited/blocked; rotates `WEB → MWEB → ANDROID` (browse) and `ANDROID → IOS → WEB → TVHTML5` (player) |
| Parsing | Tolerant renderer walker | YouTube mixes `videoRenderer`, `lockupViewModel`, `shortsLockupViewModel`, entity-batch comments; path-based parsing breaks weekly |
| Streams | Return signed URLs, never proxy video | Vercel serverless limits + egress; only thumbnails/subtitles/manifests are proxied |
| Playback failure | Automatic `<iframe>` embed fallback | The app must never show a broken player |
| Caching | Upstash Redis REST (or Vercel KV) → in-memory fallback | Single `cached()` helper works on Edge and Node; `s-maxage` + `stale-while-revalidate` on every route |
| Local data | Dexie (IndexedDB) | History/playlists/subscriptions stay on the device |
| Auth | Sealed cookie, not a database | No server state; AES-GCM key derived from `SESSION_SECRET` |
| Offline | Serwist | Precache shell, offline fallback page, runtime caching for images |

### Runtime split

- **Edge**: `home`, `search`, `suggest`, `guide`, `channel`, `playlist`, `proxy/image`, `proxy/timedtext`
  (pure fetch + Web Crypto, ideal for edge caching).
- **Node**: `video`, `stream`, `comments`, `auth` (player unlocking needs `new Function` on YouTube's JS,
  `node:crypto`-free but Node-only APIs).

`vercel.json` sets `maxDuration: 30` for the Node routes; every route also has an internal 12s abort
controller so a hung upstream never eats the whole budget.

### Signing in (Google TV device flow)

Settings → **Sign in with Google** starts the OAuth 2.0 device flow against the YouTube **TV (Cobalt)**
client:

1. `POST /api/auth/device/start` asks Google for a `device_code` + `user_code`. The `device_code` is
   sealed (AES-GCM) into an httpOnly cookie; it is the only value that can be exchanged for a token, so it
   never reaches page JavaScript.
2. The UI shows the short code and opens `google.com/device`. **The user types their email and password on
   Google's own page.** This app never renders a password field, never receives a password, and cannot see
   the account credentials.
3. `/api/auth/device/poll` polls `o/oauth2/token` on the interval Google returned until the user approves,
   the code expires (30 min), or access is denied. Outcomes map to explicit UI states (`pending`,
   `slow_down`, `expired`, `denied`).
4. On approval the `access_token` + `refresh_token` are sealed into the httpOnly `ft_oauth` cookie. Requests
   to InnerTube then carry `Authorization: Bearer <access_token>`, which is what unlocks a personal Home
   feed, Subscriptions, History, playlists, Liked and native stream URLs.
5. Access tokens live 60 minutes and are refreshed lazily **60 seconds before expiry** inside route
   handlers, which are allowed to rewrite the cookie. A revoked refresh token clears the session instead of
   looping. **Sign out** deletes every cookie (`ft_oauth`, `ft_profile`, `ft_session`).

Nothing is sent anywhere except to YouTube/Google, and no token is ever logged. The only diagnostics are
redacted one-line JSON records (endpoint, client, auth mode, error) - see `src/lib/innertube/client.ts`.

**Why not the official Google OAuth + YouTube Data API v3?** That path needs a Google Cloud project, a
registered OAuth client and an API key review. It also cannot return the personalised recommendation feed:
`youtube.readonly` exposes Subscriptions, Playlists and Likes, but not "recommended for you". The TV flow
is the only supported route to a personal home feed.

**When the device flow is blocked** (Google occasionally rejects the TV client for a region or an account),
the fallback is Settings → *Advanced: paste cookies* (sealed the same way), or anonymous mode with no
sign-in at all - browsing, search and the embed player work without any account.

---

## 3. Getting started

```bash
git clone https://github.com/<you>/Freetube.git
cd Freetube
npm install
cp .env.example .env.local
# edit .env.local (all values are optional for local dev)
npm run dev          # http://localhost:3000
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (service worker disabled) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (flat config, `next/core-web-vitals` + TS) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (parsers, cipher, protobuf params, schema) |
| `npm run e2e` | Playwright (desktop + Pixel 7 projects) |

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | recommended | Canonical URL for metadata/manifest |
| `INNERTUBE_REGION` / `INNERTUBE_LANGUAGE` | optional | `gl` / `hl` context hints (default `US` / `en`) |
| `UPSTASH_REDIS_REST_URL` + `..._TOKEN` | optional | Shared cache. Also reads `KV_REST_API_URL` / `KV_REST_API_TOKEN`, so a Vercel KV store works unchanged |
| `SESSION_SECRET` | for login mode | 32+ chars; AES-GCM key for the sealed OAuth tokens and pasted cookies. `openssl rand -base64 32` |
| `YT_OAUTH_CLIENT_ID` / `YT_OAUTH_CLIENT_SECRET` | optional | Override the public YouTube TV (Cobalt) OAuth client used by the device flow. Defaults are bundled; override only if Google rotates them |
| `YT_VISITOR_DATA` | optional | Base64 `visitorData` from a browser session; sometimes clears the "confirm you're not a bot" wall |

Without Redis the app uses a bounded in-memory cache (fine locally; on Vercel each cold isolate starts
empty, so Redis is strongly recommended in production).

---

## 4. Project layout

```
src/
  app/
    (app)/            # shell routes: home, search, watch, channel, shorts, library, settings…
    api/              # route handlers (edge + node)
    manifest.ts       # PWA manifest
    sw.ts             # Serwist service worker source
  components/
    layout/ player/ video/ watch/ channel/ shorts/ library/ settings/ ui/
  lib/
    innertube/
      client.ts       # transport: rotation, retry, cache, auth
      contexts.ts     # WEB / MWEB / ANDROID / IOS / TVHTML5
      endpoints/      # browse, search, next, player
      parse/          # walk (renderer walker), video, home, channel, comments, playlist
      cipher.ts       # signature decipher + n transform
      params.ts       # protobuf search filters
      schema.ts       # Zod
    auth/             # AES-GCM session + SAPISIDHASH
    cache/            # Redis REST / memory
  db/                 # Dexie schema + hooks
  store/              # Zustand (player, ui)
tests/                # Vitest (+ JSON fixtures)
e2e/                  # Playwright
```

### API routes

| Route | Runtime | Cache | Purpose |
| --- | --- | --- | --- |
| `GET /api/home` | edge | 120s | Feed + chips, continuation |
| `GET /api/search` | edge | 300s | Search + filters + continuation |
| `GET /api/suggest` | edge | 600s | Autosuggest |
| `GET /api/video/[id]` | node | 120s (SWR 600) | Details + streams + related + comments token |
| `GET /api/stream/[id]` | node | private 30s | Refresh expired stream URLs |
| `GET /api/channel/[id]` | edge | 300s | Channel + tabs |
| `GET /api/playlist/[id]` | edge | 300s | Remote playlist |
| `GET /api/comments` | node | 120s | Comments page (continuation) |
| `GET /api/guide` | edge | 3600s | Sidebar guide |
| `POST/GET/DELETE /api/auth/session` | node | – | Connect / inspect / disconnect cookies |
| `GET /api/proxy/image` | edge | 7 days | Thumbnails (allow-listed hosts) |
| `GET /api/proxy/timedtext` | edge | 1 day | Subtitle tracks (CORS) |

---

## 5. Deploy

### 5.1 Push to GitHub

```bash
git init
git add .
git commit -m "feat: Freetube - Next.js 15 InnerTube client"
gh repo create Freetube --public --source=. --push
# without gh:
#   git remote add origin https://github.com/<you>/Freetube.git
#   git branch -M main && git push -u origin main
```

### 5.2 Vercel

```bash
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SITE_URL production      # https://<project>.vercel.app
vercel env add SESSION_SECRET production            # openssl rand -base64 32
vercel env add UPSTASH_REDIS_REST_URL production    # optional but recommended
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel --prod
```

Or with a token, non-interactively:

```bash
export VERCEL_TOKEN=***
npx vercel deploy --prod --yes --token "$VERCEL_TOKEN"
```

`vercel.json` already pins `maxDuration` per Node route. Auto-deploy from `main` is on by default once
the Git integration is connected (Project → Settings → Git).

### 5.3 CI

`.github/workflows/ci.yml` runs typecheck, lint, unit tests and a production build on every push/PR,
plus Playwright on `main`.

---

## 6. Install as an app

| Platform | Steps |
| --- | --- |
| **Android** (Chrome/Edge) | ⋮ menu → *Add to Home screen* → *Install*. Runs standalone, supports pull-to-refresh and back gesture. |
| **iOS / iPadOS** (Safari) | Share → *Add to Home Screen*. Uses `apple-mobile-web-app-capable`; audio continues when locked (Media Session). |
| **Windows 10/11** (Chrome/Edge) | Address-bar install icon → *Install Freetube*. Launches in its own window; the manifest declares `window-controls-overlay` so the title bar merges with the app. |
| **macOS / Linux** (Chrome/Edge) | Same install icon in the address bar. |

Offline: the app shell is precached; reopening without a network shows the cached UI and an offline
banner. Video playback obviously requires connectivity.

---

## 7. Known limitations (read this)

1. **Anonymous native playback is not possible from datacenter IPs.** YouTube answers unsigned-in
   `player` requests from Vercel/AWS ranges with `LOGIN_REQUIRED - Sign in to confirm you're not a bot` for
   every client context, and the newer `WEB` clients additionally require a **PO token** we cannot mint
   server-side. Verified against the live API: `WEB`, `MWEB`, `TVHTML5`, `ANDROID`, `IOS` and
   `WEB_EMBEDDED_PLAYER` all return zero formats for anonymous requests from the deployment IP.
   Consequences:
   - **Signed in** (device flow) → `Authorization: Bearer` clears the bot wall and native streams work.
   - **Signed out** → the player uses the **official embed**, silently: no badge, no technical text. Only if
     the embed itself refuses (owner disabled embedding, age gate, live without permissions) does the UI
     show a plain message with **Try again** and *Open on YouTube*.
   - The app rotates `TVHTML5 → ANDROID → IOS → WEB`, retries each twice with jittered backoff, ranks formats
     by browser playability (H.264 → VP9 → AV1, muxed before adaptive) and logs one redacted line
     (`scope`, `videoId`, `client`, `auth`, `status`, `reason`) to the server console for diagnosis.
2. **Sign-in is optional.** Anonymous mode still browses, searches, plays via embed and keeps local
   history/playlists. Cookies remain available as an advanced fallback; tokens are AES-GCM sealed and never
   logged. YouTube may flag automation on any third-party client - use your own account and accept that.
3. **Shorts and live** use the embed, not native playback (most aggressively gated surfaces).

### Background audio: platform behaviour

| Platform | Result | Notes |
| --- | --- | --- |
| Android Chrome (PWA installed) | ✅ Keeps playing | `<audio>` + Media Session; the audio-only handoff runs when the document becomes hidden |
| Android Chrome (browser tab) | ✅ Keeps playing | Same path; Chrome may throttle timers but audio playback continues |
| iOS Safari (PWA standalone) | ⚠️ Mostly | Must be installed *and* playback started from a tap. iOS suspends media when the app is force-closed or after long backgrounding; the video track stops, audio continues in most cases |
| iOS Safari (tab) | ⚠️ Limited | Tab backgrounding can suspend media; Apple only guarantees audio for `<audio>` with an active Media Session |
| Lock screen / notification | ✅ | Play/pause, ±10s, next/previous and a scrubbable position bar come from Media Session |
| Desktop when the OS sleeps | ⚠️ | The browser suspends the tab; playback resumes from the saved position |
4. **Comments are read-only.** Replies pagination is not implemented (the "show more" flow is).
5. **No video proxying.** If a network blocks `googlevideo.com` outright, playback falls back to embed.
6. **APIs are unofficial.** Endpoint names/params can change without notice; the tolerant walker reduces
   (not eliminates) breakage. Update `src/lib/innertube/parse/*` when YouTube reshuffles renderers.

---

## 8. Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright install --with-deps chromium   # once
npm run e2e
```

Unit tests cover: count/duration formatting, thumbnail selection, protobuf search params (asserted against
the exact base64 YouTube emits), cipher plan extraction + `n` transform, renderer merging
(`videoRenderer` + `lockupViewModel`), watch-page parsing, comments entity-batch parsing, Zod validation,
**mini-player close vs. natural end** (stop clears the queue and never advances; `next()` still does) and
**token refresh** (safety window, refresh-token retention, device-flow error mapping).

E2E covers the shell, search, settings and the served manifest on desktop + a Pixel 7 viewport.

---

## 9. License

MIT for the code in this repository. No YouTube assets are redistributed.
