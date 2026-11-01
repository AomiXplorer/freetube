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
| Media Session / background audio | ✅ | Lock-screen controls + next track |
| PWA: installable, standalone, offline shell, Windows overlay | ✅ | Serwist service worker + `display_override: window-controls-overlay` |
| Optional YouTube login (cookie mode) | ✅ | AES-256-GCM sealed httpOnly cookie + SAPISIDHASH |
| Native stream URLs (signature + `n` unlock) | ⚠️ Best effort | Works only where YouTube allows the request; otherwise automatic embed fallback (see §7) |
| Downloads / casting / live chat | ❌ Not implemented | Deliberate scope cut |
| Uploading, commenting, liking on YouTube's side | ❌ Read-only client | Everything user-side is local |

### Player

- HLS via `hls.js` when the response exposes a manifest, progressive `googlevideo` URLs otherwise,
  separate `<audio>` track with drift correction when only adaptive (video-only) formats exist.
- Quality picker, playback speed, captions (`<track>` through a tiny proxy), PiP, fullscreen, theater mode.
- Mobile gestures: double-tap seek (±10s), vertical swipe for volume (left) / brightness (right).
- Keyboard: `Space`/`K` play, `J`/`L` ±10s, `←`/`→` ±5s, `↑`/`↓` volume, `M` mute, `F` fullscreen,
  `T` theater, `C` captions, `I` PiP, `>`/`<` speed, `0-9` seek percent.
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
| `SESSION_SECRET` | for login mode | 32+ chars; encrypts the user's YouTube cookies. `openssl rand -base64 32` |
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

1. **Stream unlocks are best effort.** YouTube signs `googlevideo` URLs with a per-request cipher and a
   rotating `n` transform inside `base.js`. `src/lib/innertube/cipher.ts` extracts and re-applies both
   (function-body parsing + an isolated evaluation of YouTube's own `n` function). YouTube changes this
   regularly, and datacenter IPs are frequently challenged with *"Sign in to confirm you're not a bot"*
   or plain `UNPLAYABLE`. When unlocking fails, `/api/video` returns `playable: false` with a reason and
   the UI switches to the **official embed player** automatically — the app stays usable.
2. **Cookie mode is optional and local.** Without it, Home is the public fallback feed and
   Subscriptions/Library are local-only. Cookies are encrypted into an httpOnly cookie; nothing is
   logged. Only use your own account, and note that YouTube may flag automation on any third-party client.
3. **Shorts and live** use the embed, not native playback (most aggressively gated surfaces).
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
(`videoRenderer` + `lockupViewModel`), watch-page parsing, comments entity-batch parsing, Zod validation.

E2E covers the shell, search, settings and the served manifest on desktop + a Pixel 7 viewport.

---

## 9. License

MIT for the code in this repository. No YouTube assets are redistributed.
