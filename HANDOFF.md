# Earth Eye handoff

Personal rebrand of the MIT-licensed project [gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) by Bilawal Sidhu. This is not a from-scratch rewrite.

| Item | Value |
|---|---|
| Visible name | Earth Eye |
| Intended domain | eartheye.us (not connected; no public host was deployed) |
| npm package name | `gods-eye-view` (left unchanged; the source imports itself that way) |
| Upstream | https://github.com/bilawalsidhu/gods-eye-view |
| Upstream commit | `81eb443` (`Merge pull request #744 from manjunath22466/fix/share-link-layer-token-allocation`) |
| Patch vs that commit | `earth-eye-vs-upstream.patch` in this folder |

License, `THIRD_PARTY_NOTICES.md`, and `DATA_SOURCES.md` still apply. Bundled datasets are not covered by MIT. Do not strip those notices.

## Not deployed

There is no public production URL. The copy that was running was a Vite **dev** server inside the build sandbox, not a production build on a host. Do not point GoDaddy at anything from this package. No DNS records were issued.

## Install and run

Node `>=24.14.0 <25` or `>=26 <27` (see `package.json` `engines`). Node 22 will fail the doctor.

```bash
cd earth-eye
npm ci
cp .env.example .env   # names only; leave values empty until you have keys
npm run doctor
npm run dev
```

Default port in `.env.example` is `4173`, bound to localhost. The sandbox preview used `HOST=0.0.0.0 PORT=8080` so an iframe could see it. For a normal machine, leave `HOST` unset.

Other useful commands already in the repo: `npm test`, `npm run build`, `npm run preview`.

There is no `.env` in this zip. `.env.example` has empty placeholders only.

## What was changed from upstream

Behavior changes are small. Branding and CCTV labeling are the product edits. Everything else is the upstream app.

- `public/logo.svg` — Earth Eye wordmark. Letters are static SVG text. The globe group (`#globe`) spins, a highlight pulses, and two orbit groups (`#globe_cage`) carry small ticks. CSS animation lives inside the SVG. `prefers-reduced-motion` turns it off. The existing logo-gaze code still looks for `#globe` and `#globe_cage`.
- `public/favicon.svg` — new, static globe mark for the browser tab. Untracked upstream.
- `index.html` — title, description, application-name, favicon.
- `src/ui/templates/scene-chrome.html` — header is the wordmark only. Subtitle: `EARTH EYE · eartheye.us`.
- `src/ui/templates/hud-loading.html` — same wordmark, no second text title.
- `src/ui/templates/welcome.html` — first-run sentence and mic tip rewritten. Not the upstream marketing line.
- `src/ui/styles/foundation.css`, `controls.css`, `responsive.css` — wordmark size, monochrome shadow, no loader scale pulse, small screens keep the wordmark instead of hiding the title.
- Visible strings `Atlas Eye` / `ATLAS EYE` renamed to Earth Eye in `src/main.js`, `src/hudSummaryResponse.js`, `src/voice/realtimeViewport.js`, `server/providers/openai/instructions.js`, `scripts/setup-doctor.mjs`, `pinokio/pinokio.js`, and matching tests (`src/pinokioLauncherContract.test.mjs`, `src/firstRunExperience.test.mjs`). Comment-only in `src/ui/applicationShell.js`.
- `README.md` — short Earth Eye banner above the upstream readme. Package name note is in that banner.
- `server/providers/cctv/sources.js` — TfL JamCams use `feedType: 'mp4'` when Open Data `videoUrl` is an official-bucket `.mp4`. Otherwise they stay still images. `snapshotUrl` remains the still.
- `src/layers/cctv/presentation.js`, `src/ui/cctvFrames.js`, `src/ui/cctvPresentation.js` — camera badge and meta line say `STILL IMAGE ONLY`, `VIDEO CLIP`, or `LIVE VIDEO`. Stills are not given a fake video player.
- `build/vite.js` — if `HOST` is `0.0.0.0` or `::`, frame-ancestors is relaxed so an embedded preview can show the page. Any other host keeps `X-Frame-Options: DENY` and `frame-ancestors 'none'`. Revert this if you do not need iframe embedding.

`earth-eye-vs-upstream.patch` is `git diff` against `81eb443` plus the new favicon is only in the tree (untracked, so it is not in the patch). Copy `public/favicon.svg` with the tree.

## Logo files

- `public/logo.svg` — animated header wordmark
- `public/favicon.svg` — static tab icon
- Header sizing: `src/ui/styles/foundation.css` (`#title-bar .title-logo`, `.brand-logo`)
- Loader sizing: `src/ui/styles/controls.css` (`.loader-logo`)
- Narrow layout: `src/ui/styles/responsive.css`

## Layers

The layer system is the upstream one. This checkout did not replace feeds with fake dots. Labels below are from probing the dev server on 28 Sep 2026. Re-check after you boot it; public feeds move.

| Layer | Status at last probe | Key |
|---|---|---|
| Basemap | Keyless Esri World Imagery. OSM is in the map tray. | `GOOGLE_MAPS_API_KEY` and/or `CESIUM_ION_TOKEN` for photorealistic 3D, ion imagery, terrain |
| Aircraft | Keyless live via adsb.lol | Optional OpenSky: `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` (`OPENSKY_AUTH_MODE`) |
| Military flights | Same adsb.lol feed, military filter | none for the keyless path |
| Ships / AIS | Needs a key. Empty without it | `AISSTREAM_API_KEY` |
| Satellites | CelesTrak was failing (HTTP 502) during the probe. No invented fallback | none |
| Earthquakes | Keyless USGS | none |
| Active fires | Empty until a key is set. UI already says key required | `FIRMS_MAP_KEY` |
| Fire perimeters | Keyless NIFC-style public feed when the upstream loader succeeds | none |
| Weather / radar / clouds / lightning | Upstream NOAA / nowCOAST / GIBS paths. No key for the public layers | none |
| CCTV | Catalog loads. Most cameras are stills and must read `STILL IMAGE ONLY`. HLS sources read `LIVE VIDEO`. TfL clips read `VIDEO CLIP` when an mp4 URL is present. Playback goes through the repo proxy `/api/cctv/media` | Ontario 511 was returning Invalid Key and contributing no cameras. Packs can be turned off with `CCTV_*_ENABLED=0` |
| Traffic | Upstream simulation when no key. Live tiles need a key | `TOMTOM_API_KEY` |
| Launches | Keyless Launch Library 2. A token only raises the allowance | `LL2_API_TOKEN` optional |
| Radio | Upstream radio layer. Not re-verified end-to-end in this pass | none for the public streams |
| Transit | Keyless feeds the upstream adapters already ship (MBTA responded in the probe) | none for those public feeds |
| Infrastructure, cables, datacenters, dams | Bundled / upstream datasets, not a live sensor | none |
| Recent imagery | Upstream layer. Not given a fake live feed | depends on the upstream provider; see `DATA_SOURCES.md` |
| Voice | Off until a key is saved. Mic tip says so | `OPENAI_API_KEY` |
| Places / Street View | Server routes need a Google key | `GOOGLE_MAPS_API_KEY` or `GOOGLE_MAPS_SERVER_API_KEY` |

Do not describe simulated traffic, a missing FIRMS key, or a CelesTrak outage as live.

## API key names

Values are not in this zip. Names only:

`GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_SERVER_API_KEY`, `CESIUM_ION_TOKEN`, `OPENAI_API_KEY`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `LL2_API_TOKEN`, `FIRMS_MAP_KEY`, `AISSTREAM_API_KEY`, `TOMTOM_API_KEY`.

Related non-secret settings are in `.env.example` (`OPENSKY_AUTH_MODE`, `OPENAI_REALTIME_*`, `VITE_AIS_LIVE_*`, `CCTV_*`, `LOCAL_RECEIVER_FEEDS`, `HOST`, `PORT`, rate-limit knobs). `GOOGLE_MAPS_API_KEY` and `CESIUM_ION_TOKEN` are injected into the browser on purpose. See `SECURITY.md`.

## Screenshots

`handoff-screenshots/` was captured from the dev server, not from a public deploy.

- `earth-eye-logo.png` — header wordmark
- `console.png` — globe console
- `layers.png` — layer panel
- `flir.png` — sensor-mode view

`docs/media/` (upstream demo gifs, about 68 MB) is not in the zip. Those files were not edited. They are still in upstream at commit `81eb443`.

## Suggested takeover

1. Clone upstream at `81eb443`, or use this tree as-is.
2. Apply `earth-eye-vs-upstream.patch` if you started from a clean clone, then add `public/favicon.svg`.
3. `npm ci` and `npm run doctor` on Node 24 or 26.
4. Decide whether to keep the `HOST=0.0.0.0` frame-ancestors exception in `build/vite.js`.
5. Deploy your own Node host. This app is a Vite server with API middleware, not a static site. GitHub Pages will not run the proxies.
