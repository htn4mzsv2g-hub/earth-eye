> Stage 2 (2026-09-28): every live source now carries health state + last
> success/attempt; licence review dates are on the registry; commercial-safe
> mode (`EE_COMMERCIAL_SAFE=1`) can disable every restricted dataset. See
> `PARITY_STATUS.md` and `STAGE2_REPORT.md`.

# Earth Eye: data sources audit

Audit date: 2026-09-28 (America/Chicago). Method: `scripts/audit-data-sources.mjs`
calls every data endpoint through the production server, the same routes the
browser uses. The **before** run was against the live app `https://eartheye.us`
(Fly `eartheye`, dfw, one shared-cpu-1x machine, no provider keys), 16:31 CT. The
after-deploy re-run is at the bottom. Raw JSON goes to `screenshots/audit/`
(gitignored).

Cadences come from the code (poll intervals in `src/layers/*`, cache TTLs in
`server/providers/*`) and from what the providers publish. Nothing here is estimated.
The in-app **Data Sources** screen (dock → SOURCES on desktop, MORE → SOURCES
on phones) renders this same table from `src/atlas/dataSourceRegistry.js`,
the single registry that the layer-row badges also read. See "Registry API"
below.

## Classification set

| Class                | Meaning                                                       |
| -------------------- | ------------------------------------------------------------- |
| LIVE                 | streamed or pushed as it happens (seconds)                    |
| NEAR LIVE            | polled public feed, seconds to minutes old                    |
| REFRESHED STILL      | still images re-fetched on a cadence                          |
| VIDEO CLIP           | short recorded clips published by the provider                |
| DAILY / PERIODIC     | products published hourly/daily or on a schedule              |
| SNAPSHOT             | a fixed extract (bundled file or map-database query)          |
| MODEL                | a numerical-model forecast, not an observation                |
| SIMULATED            | generated; never real positions                               |
| KEY REQUIRED         | off until the operator sets a provider key                    |
| BROKEN / UNAVAILABLE | the provider cannot be reached or refuses the hosted server   |

The registry class is the class **when the source is healthy and keyless**.
At runtime `classifyLayer()` changes it to BROKEN / UNAVAILABLE when an enabled
layer's fetch fails with no data, to KEY REQUIRED when the server says a key
is missing, and shows **FALLBACK** (with source and age) when a real secondary
source is serving.

## Launch table (all layers are OFF at launch)

| Layer | Provider (endpoint) | Keyless from live server | Actual cadence | Class | Coverage | Changed in this pass |
| ----- | ------------------- | ------------------------ | -------------- | ----- | -------- | -------------------- |
| Live Flights | OpenSky `/api/states/all` → adsb.lol `/v2/lat/…/dist/250` fallback (`/api/opensky`) | ✅ 200, 11,071 aircraft (served by the adsb.lol fallback) | poll 30 s, server cache 9–12 s | NEAR LIVE (+FALLBACK when adsb.lol serves) | Global where volunteer receivers report; fallback is 250 nm around the view | Active feed (OpenSky / adsb.lol fallback) shown on the status screen and layer badge |
| Military Flights | adsb.lol `/v2/mil` (`/api/adsblol/mil`) | ✅ 200, 298 aircraft | poll 15 s, cache 12 s | NEAR LIVE | Global (publicly broadcasting aircraft only) | none |
| Local ADS-B | your own receiver (`LOCAL_RECEIVER_FEEDS` / WebUSB RTL-SDR) | n/a (no receiver on Fly; no WebUSB in iPhone Safari) | 1 s with a receiver | LIVE with a receiver, otherwise BROKEN / UNAVAILABLE | receiver range | badge says unavailable without a receiver |
| Live AIS Vessels | AISStream websocket (`/api/ais-live`) | ❌ 503 `AISSTREAM_API_KEY is not set` | stream; layer reads every 60 s | KEY REQUIRED | coastal, where receivers hear ships | none (no simulated ships exist in the app) |
| Earthquakes (24h) | USGS `summary/all_day.geojson` (browser-direct) | ✅ 200, 243 events | poll 60 s; USGS regenerates every minute | NEAR LIVE | Global; small quakes listed mainly where regional networks report (mostly U.S.) | none |
| Fire Perimeters | NIFC WFIGS ArcGIS (`/api/fire-perimeters`) | ✅ 200 | poll 5 min; updates when incident teams publish | DAILY / PERIODIC | U.S. only | labelled "NIFC perimeters" |
| FIRMS Active Fires | NASA FIRMS public 24 h CSVs (MODIS C6.1 + NOAA-20 VIIRS) keyless; FIRMS area API with `FIRMS_MAP_KEY` (`/api/firms`) | ✅ 200, 69,963 hotspots (`fallback:true, keyless:true`) | poll 10 min, cache 30 min; rolling 24 h files | DAILY / PERIODIC (+FALLBACK "NASA FIRMS public 24 h files") | Global | Active product (NASA 24 h files vs keyed FIRMS API) shown |
| Satellites | CelesTrak GP `gp.php?GROUP=…` (`/api/celestrak/:group`) + SGP4 in the browser | ❌ **502 on every group**: CelesTrak refuses this server (and this build box) | TLEs cached 6 h; positions every frame | DAILY / PERIODIC when reachable; **BROKEN / UNAVAILABLE on live today** | Global | AMSAT substitute is now **opt-in** (`TLE_AMSAT_FALLBACK=1`, off). A real cached CelesTrak copy is served as FALLBACK with its fetch time. Otherwise the layer says "CelesTrak unreachable" |
| Space Missions (30d) | The Space Devs Launch Library 2 `2.3.0/launches/` (`/api/launches`) | ✅ 200, 28 launches | cache 15 min; keyless limit ~15 req/h | DAILY / PERIODIC | Global | none; trajectories were already labelled "RECONSTRUCTED ESTIMATE" |
| Street Traffic | generated dots on OSM roads (`/api/overpass`); TomTom flow only with `TOMTOM_API_KEY` | `hasKey:false` → simulation | animated | **SIMULATED**, OFF by default | roads in view | badge SIMULATED everywhere; stays off by default |
| CCTV | 13 public agency catalogs (`/api/cctv/sources`, `/frame/:id`, `/clip/:id`, `/media/:id`) | ✅ 2,863 cameras from 11 providers; 2 providers broken (see below) | stills re-checked every 60 s (Fintraffic 10 min, TxDOT 60 s); clips on demand; HLS live | REFRESHED STILL / VIDEO CLIP / LIVE (per camera) | see provider table | per-camera media type from provider data; synthetic frame removed; Street View substitute opt-in |
| Radio | Radio Browser mirrors (`/api/radio/stations`) | ✅ 200, 750 stations | directory cached 45 min; streams live | LIVE | Global | none |
| Transit | operator GTFS-RT feeds (`/api/transit/vehicles/:feed`) | ✅ registry 200 (7 feeds); MBTA 789, CapMetro 391, TransLink SEQ 1,461 vehicles (all 7 feeds 200 in the after-deploy run) | poll 15 s when zoomed in | NEAR LIVE | 7 metro areas | none |
| Bikeshare | GBFS feeds (`/api/gbfs/…`) | ✅ 200, 86 Austin stations | poll 60 s | NEAR LIVE | configured cities | none |
| Directions | OSRM on routing.openstreetmap.de (`/api/route`) | ✅ 200 | on request, cache 10 min | SNAPSHOT | Global OSM roads | "not for navigation" kept |
| Recent Imagery | NASA GIBS WMTS / CMR (browser-direct) | ✅ 200 | daily products | DAILY / PERIODIC | Global | none |
| Mapped Installations | OSM via Overpass (`/api/military-installations`) | ⚠️ timed out at 45 s during the audit (public Overpass mirrors are slow) | on view change; cache 5 min / 30 d disk | SNAPSHOT (BROKEN when Overpass times out) | Global, where mapped | none |
| Global Context | composite of enabled layers (in-browser) | n/a | recomputed | SNAPSHOT | whatever is on | none |
| ALPR Cameras | OSM-mapped locations via Overpass (`/api/overpass`) | ⚠️ timed out at 45 s | on view change; cache 24 h | SNAPSHOT (BROKEN when Overpass times out) | only where mapped | none; locations and tags only, no plate data |
| Wind | NOAA GFS (`noaa-gfs-bdp-pds` S3) / ECMWF IFS open data (`/api/wind`) | ✅ 200 | checked hourly; model runs every 6 h | MODEL | Global grid | classed MODEL (forecast, not observation) |
| Rain radar | NOAA nowCOAST MRMS (`/api/weather?product=radar`) | ✅ 200, 13 frames | poll 2 min; ~4 min updates | NEAR LIVE | CONUS only | none |
| Satellite clouds | NOAA nowCOAST GOES regional IR + global IR mosaic (`product=clouds-regional` / `clouds`) | ✅ (re-checked after deploy, below) | GOES ~5 min; global mosaic hourly, 2–3 h latency | NEAR LIVE | North America (GOES); global mosaic elsewhere | limitation text added |
| Lightning density | NOAA nowCOAST (`product=lightning`) | ✅ 200, 13 frames | poll 10 min; 15-min accumulations | NEAR LIVE | Pacific + Americas, not global | none |
| Cyclone advisories | NOAA NHC / CPHC (`/api/cyclones`) | ✅ 200, 5 systems | advisories every 6 h (more often near landfall) | DAILY / PERIODIC | NHC/CPHC basins | none |
| Datacenters | OSM extract bundled in the repo | n/a (static) | never | SNAPSHOT | Global | source renamed "OSM snapshot" |
| Dams | OSM / OpenInfraMap extract bundled | n/a | never | SNAPSHOT | Global | source renamed "OSM/OpenInfraMap snapshot" |
| Submarine Cables | TeleGeography extract bundled | n/a | never | SNAPSHOT | Global | none |
| Bhote Koshi Flood / Locator | Vantor / GeoPera scene + derived centerline, bundled | n/a | static event replay | SNAPSHOT | one river in Nepal | none |

Base map and search (not toggleable layers): Esri World Imagery plus keyless
terrain is the default (✅). OpenStreetMap tiles are ✅. Cesium ion and Google
Photorealistic 3D are KEY REQUIRED and not set. Place search uses Photon and
Nominatim (✅ 200) and is rate-limited.

## CCTV: media type per camera

The media type comes from what the provider publishes
(`server/providers/cctv/mediaKind.js`), not from a guess:

- an HLS `.m3u8` URL with feedType `hls` → **LIVE VIDEO**
- an `.mp4` clip URL (`clipUrl` or an mp4 feed) → **VIDEO CLIP**
- a snapshot or image URL, or feedType `image` → **STILL IMAGE ONLY**
- none of those → no media (**Unavailable**)

Every `/api/cctv/sources` entry now carries `media: {kind, label, live, clip,
still, …}`.

| Provider | Cameras (live server) | Media type | Evidence |
| -------- | --------------------- | ---------- | -------- |
| TxDOT | 500 | STILL IMAGE | JPEG frames (upstream-image 200) |
| Caltrans | 300 | STILL IMAGE | JPEG |
| Fintraffic | 300 | STILL IMAGE | JPEG; Fintraffic refreshes about every 10 min |
| DelDOT | 300 | **LIVE VIDEO** | HLS: playlist `application/vnd.apple.mpegurl`, segments `video/mp2t`, through `/api/cctv/media/:id?lease=…`. Only reachable from the Fly server; the frame endpoint used to return a synthetic SVG (removed) |
| City of Tallinn | 255 | STILL IMAGE | JPEG |
| Austin TPW | 250 | STILL IMAGE | JPEG |
| Transport for London (JamCams) | 250 | **VIDEO CLIP** + still | TfL publishes one short recorded `.mp4` per camera (`videoUrl`) plus a JPEG. The browser offers the clip; the 3D layer stays on stills |
| DriveBC | 250 | STILL IMAGE | JPEG |
| Live Traffic NSW | 240 | STILL IMAGE | JPEG |
| City of Calgary | 217 | STILL IMAGE | JPEG |
| Stadt Warendorf | 1 | STILL IMAGE | JPEG |
| Ontario 511 | 0 | BROKEN / UNAVAILABLE | catalog request HTTP 400 |
| Tarktee | 0 | BROKEN / UNAVAILABLE | catalog request times out |
| **Total** | **2,863** | LIVE 300 · CLIP 250 · STILL 2,313 | |

**Update 2026-09-28 9:45 PM CT (Stage 1 deploy, Fly v6):** DelDOT is now held
"pending review" in `server/providers/cctv/permissions.js` (public HLS with no
written licence, the same posture as Maryland CHART), so the live server
offers **no LIVE video**: 1,557 cameras (Caltrans 300, Fintraffic 300, DriveBC
250, NSW 240, Calgary 217 still; TfL 250 clip). The live player is tested only
against a synthetic ffmpeg test stream injected by `scripts/qa-touch.mjs`.
The table above is the earlier audit snapshot.

The only true LIVE HLS on the live server came from DelDOT's 300 cameras.
From the build box DelDOT and TxDOT/Caltrans are not reachable (1,763 cameras,
no live ones), which is why the live path was verified against
https://eartheye.us.

## Fake, demo, placeholder and simulated paths found, and what happened to each

I grepped for mock, demo, sample, fake, placeholder, random, simulate,
synthetic, fallback, dummy, stub, lorem and generated across `src/` and
`server/`.

| Path | What it did | Handling |
| ---- | ----------- | -------- |
| `server/providers/cctv/media.js` `buildSyntheticCctvSvg` | When a camera had no still (all DelDOT HLS cameras) or the upstream failed, `/api/cctv/frame/:id` returned a generated SVG "frame" with HTTP 200 | **Removed.** Now a JSON 404/502 with `X-CCTV-Source: unavailable`, and the viewer shows UNAVAILABLE |
| CCTV Street View substitute | A failed camera frame could be replaced by a Google Street View image of the location (a different picture from a different time) | **Off by default.** It only runs with `CCTV_STREETVIEW_FALLBACK=1` and is labelled `streetview-fallback` (it also needs a Google key, which is not set) |
| AMSAT TLE substitute (`celestrak.js`) | When CelesTrak failed, the `stations` group was silently served from AMSAT | **Opt-in** (`TLE_AMSAT_FALLBACK=1`, off). When on, it is labelled FALLBACK "AMSAT TLEs (operator opt-in, not CelesTrak)". A real cached CelesTrak copy is labelled with its fetch time |
| Street Traffic simulation | Generated vehicle dots on OSM roads without a TomTom key | Kept as a visual, **labelled SIMULATED everywhere and OFF by default** |
| HUD (`src/hud.js`) | Random "mission" IDs, "UNCLASSIFIED", a blinking REC dot, "SESSION …" and a NIIRS rating (implied imagery-intelligence grading) | Replaced with fixed honest text: "EARTH EYE · PUBLIC DATA", "PUBLIC SOURCES ONLY · NOT FOR NAVIGATION", a static UTC label, "LOCAL VIEW · NOT RECORDING". NIIRS removed; GSD shown as "GSD≈x m (view est.)" |
| FLIR style (`src/styles/thermal.js`) | Drew made-up temperature digits over the thermal look | Temperature digits removed (it is only a colour style) |
| Datacenters / dams source labels | Presented like live registries | Relabelled "OSM snapshot" / "OSM/OpenInfraMap snapshot" |
| CCTV camera headings | Some headings are estimated from road geometry | Already labelled `headingEstimated` in the camera card; unchanged |
| Flight / transit motion between reports | Dead-reckoning / interpolation for smooth display | Documented in the cadence text ("extrapolated between reports") on the status screen |
| Launch trajectories | Reconstructed ascent paths | Already labelled "RECONSTRUCTED ESTIMATE"; unchanged |
| Vessels evidence harness (`src/layers/vessels/evidence.js`) | Lets a dev-server QA script inject vessel rows (`transportStatus: 'synthetic'`) | Guarded by `import.meta.env.DEV`, so it is compiled out of production builds. There are no simulated ships at runtime |
| Radio static noise, wind particle seeding, Global Context composites | Visual effects only (audio hiss between stations, random particle seeds, a composite of real layers) | Not data; unchanged |
| FIRMS keyless 24 h files | Real NASA files used when no key is set | Kept as a real fallback, labelled FALLBACK "NASA FIRMS public 24 h files" with age |
| Flights adsb.lol | Real secondary feed | Kept, labelled "adsb.lol fallback" with its coverage |

## Registry API (for future panels)

`src/atlas/dataSourceRegistry.js`:

- `DATA_SOURCES[id]` holds `layerId, name, group, provider, sourceUrl, credit,
  endpoint, cadence, pollMs, classification, coverage, limitation(s),
  safeToSummarize, disclaimer, keyed?, license`. `safeToSummarize` is false
  for Street Traffic (simulated), CCTV (camera imagery), ALPR Cameras, Mapped
  Installations and Global Context. It is also false at runtime for any layer
  that is failed, SIMULATED or KEY REQUIRED.
- `createSourceStatusStore()` returns a read-only store:
  - `report(id, {stats, enabled})` / `reportLayers(dataManager.getAll())`:
    layers report in.
  - `getSourceStatus(id?)`: frozen status objects `{layerId, provider,
    sourceUrl, credit, status, lastSuccess, cadence, coverage, limitations,
    enabled, safeToSummarize, failed, error, lastError, disclaimer, feed,
    fallback, count, reason, endpoint, …}`. `status` is one of the ten
    classes.
  - `subscribe(cb)`: returns an unsubscribe function.

The app's instance is `sourceStatus` (in `src/atlas/dataSourcesPanel.js`),
fed every 5 s by the console. It is exposed read-only as
`window.__atlasEye.sources.{getSourceStatus, subscribe}`.
`lastSuccessAt` is only ever a real observed `lastUpdate`; it is `null` until
data arrives.

## New operator flags (both default off)

- `TLE_AMSAT_FALLBACK=1`: allow the labelled AMSAT substitute for the
  stations group.
- `CCTV_STREETVIEW_FALLBACK=1`: allow a labelled Street View substitute for
  failed camera frames (also needs a Google server key).

## After-deploy re-run (live, 17:52 CT)

Run with `scripts/audit-data-sources.mjs --url https://eartheye.us`, signed in.

| Source | Result |
| ------ | ------ |
| Live Flights | 200, 9,943 aircraft |
| Military Flights | 200, 223 aircraft |
| Earthquakes | 200, 249 events |
| Fire Perimeters | 200 |
| FIRMS | 200, 68,079 hotspots, keyless NASA 24 h files (FALLBACK) |
| Satellites | **502 on all 7 groups, stations included**: the AMSAT substitute is now off, so the layer shows BROKEN / UNAVAILABLE ("CelesTrak unreachable") instead of substitute data |
| Space Missions | 200, 28 launches |
| Street Traffic | `hasKey:false` → SIMULATED |
| Live AIS | 503 `AISSTREAM_API_KEY is not set` → KEY REQUIRED |
| Radio | 200, 750 stations |
| Transit | all 7 feeds 200: MBTA 687, CapMetro 390, Metro Transit 476, HSL 102, OVapi 370, Entur 625, TransLink SEQ 1,384 vehicles. The before-run used wrong feed ids for four of them (script bug, now fixed) |
| Bikeshare | 200, 86 stations |
| Directions / geocode | 200 / 200 |
| Recent Imagery | 200 |
| Wind | 200 (GFS) |
| Rain radar | 200, 13 frames, latest 17:44 CT |
| Satellite clouds | GOES regional 200, 13 frames, latest 17:48 CT; global mosaic 200, 7 frames, latest 17:00 CT |
| Lightning | 200, 13 frames, latest 17:45 CT |
| Cyclones | 200, 5 systems |
| Mapped Installations / ALPR | timed out at 45 s again (public Overpass mirrors); these layers show BROKEN / UNAVAILABLE when that happens |
| CCTV | 2,863 cameras; every sampled still frame 200 `image/jpeg` from upstream; DelDOT frame now 404 `unavailable` (no synthetic SVG); DelDOT HLS needs a viewer lease (400 without one, which is expected) |
