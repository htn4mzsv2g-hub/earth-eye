# Stage 4 milestone — OpenFreeMap installations + open-DEM scale

Date: 2026-09-29 ~2:45 AM CT (America/Chicago)

## 1. Users can do
- See mapped military installations from **OpenFreeMap** vector tiles + bundled worldwide name index (wide views show named points without Overpass).
- Honest OSM + OpenFreeMap/OpenMapTiles credits when installations are on-screen.
- CCTV ground heights from open Re:Earth DEM for the catalog dump set (not Google 3D Tiles).

## 2. Fixed / shipped
- Ported installations OpenFreeMap path (source/ingestion/rendering/named markers/lifecycle) from upstream `fix/overpass-offload` **excluding traffic and ALPR**.
- Bundled `src/data/local_data/osm_military_names/` (~3.8 MB).
- Server: Overpass-optional military-installations (`OVERPASS_UPSTREAMS` empty → DISABLED/STALE; EE keeps default mirrors as fallback).
- open-DEM rederive at scale from existing dump (1942 cameras).
- COMMS-0 foundation remains (Broadcastify HELD / no apply; LiveATC blocked).

## 3. Providers verified
- OpenFreeMap tiles: `https://tiles.openfreemap.org/planet` (unit fixtures Camp Mabry / Austin).
- Name pack integrity tests (sha256 / unique ids).
- Re:Earth `terrain.reearth.land/heights.json` for DEM batch.

## 4. Tests
- 107/107: openFreeMap, militaryTileGeometry, vectorTiles, militaryNames, installations (source/namedMarkers/namesLoading/lifecycle/selection/selectionFill/navigation), COMMS-0, stage2Policy, stage4Packs, celestrakOmm, overpassProxy.

## 5. Perf
- Tile LRU + per-view cap (max 16 tiles, min z9); wide views use name points only (no tile storm).
- DEM batch via Re:Earth multi-point queries.

## 6. Limits
- Traffic roads / ALPR extracts from upstream offload **not** ported (excluded).
- Full catalog DEM requires a dump (`CCTV_CATALOG_DUMP`); live catalog is auth-gated.
- Broadcastify still HELD (no apply/email). iPhone lag open. No push. Option C unchanged.

## 7. Next
- Stage 5 event workspaces / hardening when packs settle.
- Wire remaining upstream installation polish only if needed; keep traffic/ALPR out.
- Redeploy Fly with this slice + COMMS-0 stub when approved by task.

## 8. SHA / release / rollback
- Branch: `stage4-sources-omm`
- SHA: `89e8678` (docs tip `506b580`)
- Release: **Fly v21** live — image `registry.fly.io/eartheye:deployment-01M3P26BJ9B8YS4PH2HZ3635ME` (~2:49 AM CT). Option C unchanged. Verified healthz/login/signup/collection-health. Rollback: v20 `deployment-01M3P1A8YMNKHGKKA50HE1XMFR`.
- Rollback: previous image `deployment-01M3P1A8YMNKHGKKA50HE1XMFR` (v20 packs/OMM)
