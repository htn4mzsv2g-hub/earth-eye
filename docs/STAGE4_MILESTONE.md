# Stage 4 milestone — packs / OMM / Overpass authenticity

Date: 2026-09-29 (America/Chicago)

## 1. Users can do
- Enable **Lake County PASSAGE** cameras (`CCTV_LAKECOUNTY_ENABLED=1`) — stills only from lakecountypassage.com.
- Enable **Singapore LTA** traffic images (`CCTV_SINGAPORE_ENABLED=1`) under Singapore Open Data Licence v1.0.
- Enable **ALERTCalifornia** / **HPWREN** wildfire cameras as **non-commercial** packs (`CCTV_ALERTCALIFORNIA_ENABLED=1` / `CCTV_HPWREN_ENABLED=1`) when not in `EE_COMMERCIAL_SAFE`.
- Satellites continue to use CelesTrak **GP OMM JSON**; AMSAT TLE fallback remains opt-in and labeled.

## 2. Fixed / shipped
- Four new CCTV loaders + permissions (NC terms recorded; commercial-safe excludes wildfire packs).
- CelesTrak upstream validation fixed for FORMAT=json (was rejecting OMM as "no TLE lines").
- Removed maps.mail.ru (VK) Overpass mirror.
- Prior authenticity slice retained (Québec, NWS alerts, open DEM height refusal).

## 3. Providers verified
- Lake County ArcGIS filter: 1566 PASSAGE rows; stills on lakecountypassage.com.
- Singapore data.gov.sg traffic-images: 8 cameras live at probe.
- ALERTCalifornia: 1311 cams with valid coords (2256 raw; nulls skipped); latest-frame.jpg 200.
- HPWREN sites.js: 505 cams; RTS 640px URLs.
- Transit/bikeshare unit suite: 38 pass.

## 4. Tests
- `server/providers/cctv/stage4Packs.test.mjs` (parse HPWREN, NC commercial-safe, pending gates)
- `server/providers/space/celestrakOmm.test.mjs`
- `src/overpassProxy.test.mjs` (4-mirror sequence)
- Transit/bikeshare unit files (38)

## 5. Perf
- ALERTCalifornia catalog ~2.8 MB — fetched only when pack enabled.
- Overpass fan-out shortened by one mirror (fail-faster when others refuse).

## 6. Limits
- All new packs remain permission-gated; NC packs off under commercial-safe.
- Full OpenFreeMap overpass-offload cherry-pick still pending (installations name index).
- CelesTrak live probe from this box failed (network); OMM path verified by URL + body detector tests.
- iPhone lag still open. No new spend. No remote push.

## 7. Next
- Cherry-pick safe Overpass offload pieces (OpenFreeMap + bundled name index).
- Finish open-DEM height rederive at scale.
- Stage 5 when Stage 4 packs settle.

## 8. SHA / release / rollback
- Branch: `stage4-sources-omm`
- SHA tip: `a855068` (feature `534f055`; deploy docs + COMMS-0)
- Release: **Fly v20** live — image `registry.fly.io/eartheye:deployment-01M3P1A8YMNKHGKKA50HE1XMFR` (2026-09-29 ~2:34 AM CT). Machine `28654321fd7928` dfw, check 1/1, Option C volume mount. Auth via host whoami (`env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN`). Verified: healthz 200, login 302→/login, signup 403, collection-health 401 auth gate, fly.dev 308. Packs env-gated. No push. No new spend.
- Rollback: `env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly deploy -a eartheye --ha=false --image registry.fly.io/eartheye:deployment-01M3P03BQD7HJDTBPAT80R9NXB` (v19); or revert `534f055`. Restore mail.ru only if owner explicitly re-approves (not recommended).
