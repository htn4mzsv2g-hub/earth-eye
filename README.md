# Earth Eye

**A local 3D console for public geospatial signals: aircraft, satellites,
quakes, fires, weather, cameras and more on one Cesium globe.**

Earth Eye is a personal, local-only fork of
[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) by Bilawal
Sidhu (MIT). The upstream architecture is kept whole: Vite + CesiumJS in the
browser, and small server-side provider proxies in `server/providers/` that
hold the keys, cache and rate-limit upstream calls. See [NOTICE.md](NOTICE.md)
for attribution and exactly what this fork changed.

> ⚠️ **Public, delayed, sometimes simulated data. Not for navigation,
> emergency or safety-critical use.** No face recognition, plate reading,
> named-person search or private-individual tracking, and no private feeds.
> Every layer carries a badge saying whether it is LIVE, FALLBACK, SIMULATED,
> BUNDLED, FORECAST or NEEDS KEY.

---

## Run it

Requires Node **24.14+ (<25)** or **26.x**, per `package.json` `engines`.

```bash
# if your system Node is older (this box ships Node 20), use a local Node 24:
export PATH=/workspace/.tools/node24/bin:$PATH   # or: nvm install 24 && nvm use 24

cd /workspace/atlas-eye
npm ci                 # set PUPPETEER_SKIP_DOWNLOAD=1 to reuse a system Chrome
npm run doctor         # checks Node + lists which providers are set (never values)

npm run dev            # dev server with Provider Settings (POWER UP) → http://localhost:4173
# or the production server (what Fly.io runs; no Vite at runtime):
npm run build && HOST=127.0.0.1 PORT=4173 npm start
# `vite preview` still works for a quick local look, but production never uses it:
npm run build && npx vite preview --port 4173 --strictPort
```

Open <http://localhost:4173>. `npm run dev` and `vite preview` bind to localhost
only; `npm start` defaults to `0.0.0.0:8080` (container default), so pass
`HOST=127.0.0.1` for a local-only run. Add `?welcome=1` for the upstream
quick-start launcher.

`npm start` runs `server/prod.mjs`: plain `node:http` serving `dist/` (long
cache for hashed assets, `no-cache` for HTML, br/gzip, SPA fallback) and the
same `/api/*` handlers as the Vite servers, with `/healthz`, security headers,
per-IP API rate limits, body-size limits, graceful SIGTERM shutdown and optional
`ALLOWED_HOSTS` / in-app sign-in (session cookie) gates. See [DEPLOY_FLY.md](DEPLOY_FLY.md).

### Checks

```bash
npm test                    # ~5,100 unit tests (node:test)
npm run check:boundaries    # import-direction / package-boundary rules
npm run format:check
npm run test:track          # headless tracking regression against a running app on :4173
                            # (PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome if no bundled Chrome).
                            # Dev server: `npm run dev` (or `npx vite --port 5173 --strictPort` and
                            # `-- --url http://localhost:5173`).
                            # Production server: `npm start` on :4173, plus the QA-only helper
                            # `node scripts/qa-harness-source-server.mjs` (serves the two src/ helper
                            # modules the harness imports) and
                            # `-- --url http://localhost:4173 --source-base http://127.0.0.1:5174/src`.
                            # Last run (production server, 2026-09-28): 109 passed, 0 failed
node scripts/qa-atlas.mjs --url http://localhost:4173 --chrome /usr/bin/google-chrome
                            # Earth Eye QA: layer matrix, commands, sensor modes, panels,
                            # share-link round trip, screenshots → screenshots/
node scripts/qa-mobile.mjs --url http://localhost:4173 --chrome /usr/bin/google-chrome
                            # phone layout at 390×844, 430×932 and 844×390: default chrome,
                            # ≥60% globe clear, overlaps, 44px targets, sheets, safety strip,
                            # cockpit, FLIR; desktop unchanged → screenshots/mobile-after/
```

---

## Using it

- **Command bar** (top centre, or press `/`): typed commands parsed locally by
  simple rules. No key or AI needed. Examples: `take me to LAX`,
  `show aircraft near me`, `select the nearest airborne aircraft`, `cockpit`,
  `track the ISS`, `show fires near Texas`, `show cameras in Austin`,
  `flir`, `detection on`, `military hud`, `mark here`, `tour`, `snapshot`, `help`.
- **Dock** (bottom right): FEEDS (per-layer status + toggles), KEYS (which
  provider keys are set, what each unlocks, where to get it), SNAP (PNG),
  TOUR, CREDITS (attribution + license warnings), SAFETY.
- **Upstream controls kept as-is:** data-layer and scene panels, display panel
  (HUD layouts, detection overlay, bloom, 3D models, scope, draw/whiteboard),
  visual presets (Normal, CRT, NVG, FLIR, Noir, Snow), cockpit with nearby
  contacts and briefing, trails, target cards, share links, scene
  import/export/preview, director playback, clean/recording view (credits stay
  visible), and optional OpenAI Realtime voice.
- **Voice** without `OPENAI_API_KEY` shows `VOICE UNAVAILABLE · ADD KEY` and
  opens the KEYS panel. Nothing is faked.
- **On a phone** (≤720px wide, or a landscape phone ≤500px tall) the globe is
  the main screen. You see only the logo, the command bar, a key badge
  (`0/10 KEYS`, taps through to KEYS) and one bottom tab bar: LAYERS · SCENES ·
  DISPLAY · CCTV · CONTEXT · MORE. Each tab opens that panel as a slide-up
  bottom sheet (one at a time; close with ✕, by tapping the tab again or by
  dragging the handle down). MORE holds search, visual presets, voice, an
  optional compact HUD readout, north/tilt/globe/share, feeds, keys, snapshot,
  tour, credits and safety. The safety notice is a one-line strip until you
  tap OK (remembered); the full text stays under SAFETY. Map credits stay
  visible above whatever is open. Desktop layout is unchanged.

---

## Keys (all optional)

Keys live in `.env` (gitignored; copy `.env.example`) or come from the
in-app **POWER UP → Provider Settings**, which is dev-server only and
loopback-only. The KEYS panel shows set/unset only, never values. Only
`GOOGLE_MAPS_API_KEY` and `CESIUM_ION_TOKEN` reach the browser, by upstream
design, so restrict both at the provider (HTTP referrer / URL limits).

| Env var                                                                                                    | Unlocks                                                                                            | Get it                                                                    | Cost                                                  |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `CESIUM_ION_TOKEN`                                                                                         | Cesium World Terrain, ion imagery, Google 3D via ion                                               | [cesium.com/ion](https://cesium.com/ion/tokens) (`assets:read`)           | Free Community plan (personal/non-commercial, quotas) |
| `GOOGLE_MAPS_API_KEY`                                                                                      | Direct Google Photorealistic 3D tiles, Places/Geocoding search                                     | [Google Cloud console](https://console.cloud.google.com/google/maps-apis) | Metered; billing required, free monthly allowance     |
| `GOOGLE_MAPS_SERVER_API_KEY`                                                                               | Separate server-side key for Places / CCTV Street View                                             | same                                                                      | Metered                                               |
| `OPENAI_API_KEY`                                                                                           | Realtime voice + AI HUD summary                                                                    | [platform.openai.com](https://platform.openai.com/api-keys)               | Metered (app has a $5/session hard cap)               |
| `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_MODEL_MINI`, `OPENAI_REALTIME_VOICE`, `OPENAI_HUD_SUMMARY_MODEL` | Model/voice choices                                                                                | n/a                                                                       | n/a                                                   |
| `AISSTREAM_API_KEY` (+ `AISSTREAM_BOUNDING_BOXES`, `AISSTREAM_MESSAGE_TYPES`)                              | Live ships (AIS)                                                                                   | [aisstream.io](https://aisstream.io)                                      | Free                                                  |
| `FIRMS_MAP_KEY`                                                                                            | Full NASA FIRMS API (multi-sensor, fresher)                                                        | [FIRMS map key](https://firms.modaps.eosdis.nasa.gov/api/map_key/)        | Free                                                  |
| `TOMTOM_API_KEY` (+ `TOMTOM_DAILY_TILE_BUDGET`)                                                            | Real traffic-flow colours on the street-traffic layer                                              | [developer.tomtom.com](https://developer.tomtom.com)                      | Free tier                                             |
| `OPENSKY_AUTH_MODE`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`                                          | OpenSky OAuth (more credits than anonymous)                                                        | [opensky-network.org](https://opensky-network.org)                        | Free (non-commercial)                                 |
| `LL2_API_TOKEN`                                                                                            | Higher Launch Library 2 rate limit                                                                 | [thespacedevs.com](https://thespacedevs.com)                              | Free tier / Patreon                                   |
| `LOCAL_RECEIVER_FEEDS`                                                                                     | Your own dump1090/readsb receiver                                                                  | your hardware ([docs/LOCAL-RECEIVERS.md](docs/LOCAL-RECEIVERS.md))        | $0 + hardware                                         |
| `CCTV_*`                                                                                                   | Per-agency camera packs on/off and caps                                                            | n/a                                                                       | n/a                                                   |
| `CCTV_TFL_VIDEO_CLIPS`                                                                                     | `true` plays TfL JamCam short `.mp4` clips instead of stills. Default `false` (still images first) | n/a                                                                       | n/a                                                   |
| `GEV_RATELIMIT_GOOGLE_PER_MIN`, `GEV_RATELIMIT_OPENAI_PER_MIN`                                             | Per-IP throttles for metered proxies                                                               | n/a                                                                       | n/a                                                   |

With no keys at all the app runs on keyless sources (Esri imagery, OSM,
adsb.lol, USGS, NOAA, NASA public files, bundled datasets…).

---

## What is live, fallback, simulated or keyed

See [FEATURES.md](FEATURES.md) for the per-layer table and what this box
could actually reach during QA. In short:

- **Keyless live:** flights (OpenSky → adsb.lol fallback), military flights
  (adsb.lol), adsbdb enrichment, USGS quakes, NIFC perimeters/InciWeb, NOAA
  nowCOAST radar/clouds/lightning, NHC/CPHC cyclones, GFS/ECMWF wind, public
  CCTV frames, GTFS-RT transit, GBFS bikeshare, Radio Browser, OSRM directions,
  NASA GIBS/CMR imagery, OSM-mapped military sites and ALPR locations,
  Launch Library 2 (rate limited).
- **Labelled fallbacks added by Earth Eye:** NASA FIRMS public 24 h files when
  `FIRMS_MAP_KEY` is unset; the last real CelesTrak copy (with its fetch
  time) when CelesTrak is unreachable. The AMSAT substitute is opt-in
  (`TLE_AMSAT_FALLBACK=1`).
- **Data Sources screen:** every layer's provider, cadence, class, coverage,
  limitation and last refresh (see `docs/DATA_SOURCES_AUDIT.md`).
- **Simulated:** street traffic without a TomTom key (upstream behaviour,
  labelled SIMULATED, off by default).
- **Needs a key, shows NEEDS KEY / disabled:** AIS ships, Google 3D/Places,
  Cesium ion terrain, OpenAI voice and HUD summary.
- **Bundled snapshots:** datacenters, dams (OSM, ODbL), TeleGeography cables
  (CC BY-NC-SA), Natural Earth, neighbourhoods, Bhote Koshi flood scene
  (CC BY-NC 4.0).

---

## Licensing — read before sharing

- **Code:** MIT ([LICENSE](LICENSE)); keep the copyright notice.
- **Data is not MIT.** [DATA_SOURCES.md](DATA_SOURCES.md) lists every source.
  Non-commercial or share-alike items include TeleGeography cables, the Bhote
  Koshi scene, OpenSky, Cesium ion Community and OSM (ODbL). Google tiles need
  Google's on-screen attribution, which stays visible in every mode.
- npm packages: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
  `package-lock.json`. Models: [public/models/README.md](public/models/README.md).

## Keeping it private / deploying

- It is local-only by default (binds `localhost`). Keep it that way for
  personal use.
- To share on a LAN or deploy, read [SECURITY.md](SECURITY.md) first: a
  reachable server brokers your keys to anyone who can reach it. Put it behind
  an authenticating proxy, set the `GEV_RATELIMIT_*` throttles, set provider
  quotas and billing alerts, and remove non-commercial datasets if the use is
  commercial. Provider Settings is disabled automatically on non-loopback
  requests.
- Never commit `.env`. `git status` should never show it.
- Fly.io deployment is prepared but **not deployed**: `Dockerfile`,
  `.dockerignore`, `fly.toml` (dfw, one shared-cpu-1x 512 MB machine,
  auto-stop) and the step-by-step runbook with costs, DNS records, rollback and
  spend-cap notes in [DEPLOY_FLY.md](DEPLOY_FLY.md).

## Brand

- Wordmark source: `public/brand/eartheye-wordmark.png` (Ruben's artwork).
- Vector redraw: `public/brand/eartheye-wordmark.svg` (original black/white),
  `eartheye-wordmark-dark.svg` (for dark backgrounds),
  `eartheye-wordmark-animated.svg` (standalone animated), `eartheye-mark.svg`
  (globe mark), `public/logo.svg` (globe mark used by the loading screen),
  `public/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`,
  `public/brand/icon-192.png` / `icon-512.png`, `public/brand/og-eartheye.png`
  (1200×630), `public/manifest.webmanifest`.
- Header: inline SVG in `src/ui/templates/scene-chrome.html`, styled by
  `src/ui/styles/brand.css`. EARTH/EYE and the rings are static; the continents
  scroll inside the globe (CSS transform, 90 s per turn) and two satellite ticks
  ride the rings (SMIL `animateMotion`, 36 s / 28 s). There is no JS animation
  loop. It pauses while the tab is hidden and is fully static under
  `prefers-reduced-motion`.
- Regenerate everything: `node scripts/brand/build-brand.mjs`. The land shapes
  are Natural Earth 1:110m (public domain), in `scripts/brand/land-strip.json`.
- Verify: `node scripts/qa-brand-header.mjs --url http://localhost:4173 --chrome /usr/bin/google-chrome`
  → `screenshots/brand/`.
- Canonical URL and OG tags point to `https://eartheye.us/`. Nothing is
  deployed and no DNS is configured; the tags only take effect once the site is hosted there.
- Internal identifiers (the `atlas-eye` npm package name used by self-imports,
  the `src/atlas/` folder, `atlas-*` DOM ids and `/api/atlas/provider-status`)
  were left as-is. They are not user-visible.

## More docs

Upstream docs are kept for reference: [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md),
[TESTING.md](TESTING.md), [SECURITY.md](SECURITY.md), [docs/](docs/)
(director, scenes, local receivers, OpenSky auth, voice, boundaries).
