# Stage 4 notes

Branch: `stage4-sources-omm` (from main after Stage 3 merge `63b7ef7`).

Controlling spec: `FINAL_BUILD_DIRECTIVE_2026-09-29.md` — authenticity first;
no fabricated observations; exclusions enforced; selection contract for events.

## Done this branch
- CelesTrak GP/OMM JSON + SGP4 (from Stage 3 merge).
- CCTV pending packs: Seattle, Iowa (CC BY 4.0 noted), Iceland, Hong Kong TD.
- Event selection contract shared (`eventDetail.js`): cyclones, FIRMS, earthquakes,
  fire-perimeters → context + `gev:event-detail-request` (Polo pattern).
- Parity accounting: 28 registry layers + local-adsb; 30 tools (radio excluded).

## Next
- Québec 511 pack; NWS CAP alerts; open DEM heights; Overpass offload;
  transit/bikeshare/recent-imagery QA; iPhone lag measurement.

Option C KEEP — no new Fly spend.

## Authenticity slice detail (a6d5b06)
- Québec: `CCTV_QUEBEC_ENABLED=1`; clips never LIVE.
- NWS: `/api/nws-alerts`; layer `weather-alerts`.
- Heights: refuse google-3d-tiles; `scripts/rederive-cctv-heights-reearth.mjs`.

## 2026-09-29 — Packs + OMM + Overpass authenticity
- Camera packs (pending gates): **lakecounty**, **singapore**, **alertcalifornia** (NC), **hpwren** (NC).
- ALERTCalifornia skips null coordinates (`Number(null)` trap).
- CelesTrak proxy accepts **OMM JSON** (FORMAT=json); no longer requires TLE line `1 ` for primary path.
- Removed unvetted **maps.mail.ru** Overpass mirror. Transit/bikeshare unit QA: 38/38 pass.

## 2026-09-29 ~2:34 AM CT — Fly deploy v20 (packs/OMM slice)
- Deployed tip `aa9ce2c` / feature `534f055` → image `deployment-01M3P1A8YMNKHGKKA50HE1XMFR`.
- Host whoami `rmontez1995@gmail.com`; cleared bad token env. Option C unchanged.
- Live: healthz ok; HTML `/` → 302 `/login`; `POST /signup` 403; collection-health gated 401.
- Tests pre-deploy: stage4Packs + celestrakOmm + overpassProxy = 16/16 pass.
- Next (parallel): OpenFreeMap overpass-offload cherry-pick; open-DEM rederive at scale; COMMS-0 audit (radio no longer blanket INTENTIONALLY_EXCLUDED — per-provider NEEDS_CREDENTIAL / PERMISSION_BLOCKED; LiveATC stays BLOCKED).

## 2026-09-29 ~2:40 AM CT — COMMS-0 + OpenFreeMap staging
- COMMS-0: radio no longer blanket INTENTIONALLY_EXCLUDED; per-provider registry in `docs/SOURCE_REGISTRY_COMMS.md` + `src/comms/providers.js`. Broadcastify **NEEDS_CREDENTIAL / license-review HELD** (owner: do not apply; ~$2500/mo + competing-scanner declines). Stub `/api/comms/broadcastify` → 403 empty feeds. LiveATC blocked. OpenMHz/RR held. Local SDR extension only.
- OpenFreeMap: staged bundled military name index at `src/data/local_data/osm_military_names/` (from upstream `fix/overpass-offload`). Full openFreeMap/vectorTiles/installations wiring deferred (needs coordinated cherry-pick; traffic/ALPR parts skipped).
- open-DEM rederive at scale still next.

## 2026-09-29 ~2:42 AM CT — open-DEM partial at scale
- Re:Earth rederive: Tallinn pack 255/255 ok → `cctv_ground_heights_reearth.json` (provider reearth-terrain). Full catalog needs authenticated dump (`CCTV_CATALOG_DUMP`); live `/api/cctv/catalog` is 401.

## 2026-09-29 ~2:45 AM CT — OpenFreeMap installations + open-DEM scale + COMMS-0 ready
- Installations wired to OpenFreeMap tiles + bundled OSM military names (upstream `fix/overpass-offload` military-only; **no traffic/ALPR**). Client falls back to tiles/names when Overpass refuses; optional Overpass remains if mirrors configured.
- Attribution: OpenStreetMap ODbL + OpenFreeMap/OpenMapTiles credits via `dataCredits.showOsmCredit(..., { openMapTiles })`.
- open-DEM: Re:Earth heights for full catalog dump `/tmp/cctv-on.json` (1942 cams, not invented) → `cctv_ground_heights_reearth.json`.
- COMMS-0 still HELD for Broadcastify apply; stub + registry local; ready to deploy docs/stub with this slice.
- Tests: 107/107 (OFM + installations + COMMS + Stage4 packs/OMM/overpass + stage2Policy).

## 2026-09-29 ~2:49 AM CT — Fly v21 (OFM installations + DEM + COMMS-0)
- Image `deployment-01M3P26BJ9B8YS4PH2HZ3635ME` @ `89e8678`. Machine v21 check 1/1.
- OpenFreeMap installations live; Broadcastify stub behind auth (HELD/no catalog); DEM heights in image.
