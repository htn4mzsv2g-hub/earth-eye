# Stage 3 report — Analyst tools, map actions, annotations

**Branch:** `stage3-analyst-routing`  
**Shipped (local):** merge to `main` after this report  
**Date:** 2026-09-29 CT  
**Option C:** KEEP (always-on + 1 GB volume + daily snapshots, 5-day retention). No new spend.

## 8-point milestone

1. **Users can:** type deterministic console commands for ~29/30 GEV actions (radio excluded); use Analyst tools (place, entities, cameras, health, fly, select, layer, stop_follow, cockpit, annotate, clear, inspect, satellite_pass, scenes, ai_status); select cyclones/events and open detail; draw via DISPLAY ▸ Draw (emulation verified).
2. **Fixed + why:** (a) straight-line route fallback removed — honesty; (b) select_nearest no longer waits for camera settle — headless/timeout; (c) annotate Analyst tool now sends `annotations[]` — was silently failing; (d) Polo/HU tap opens detail, OSM sites fetch bounded — P0 iPhone; (e) typed schema coverage completed including `set_layer_visibility`.
3. **Providers:** OSRM/FOSSGIS (routing), Nominatim (places), NHC/CPHC (cyclones), registry-gated layers, OpenStreetMap Overpass (installations, timed).
4. **Tests + device:** Journey live Chromium **10/0** on eartheye.us (2026-09-29 ~1:55 AM CT).  Unit: commandParser, analystTools, selectNearestCompletion, cyclone context, annotation routing. Journey: `scripts/qa-analyst-journey.mjs` (Chromium emulation, login-capable). Draw smoke: `scripts/qa-draw-touch-smoke.mjs` (emulation). **Physical iPhone lag still open** — measure on device.
5. **Perf:** No new always-on cost beyond Option C (~$4.20/mo). Installations Overpass capped at 15s.
6. **Limits:** control_radio excluded; AI summaries off; Seattle CCTV pending gate; draw/measure touch on real iPhone unverified; credential UI still Stage 2 honesty gap.
7. **Next:** Stage 4 — GP/OMM satellites (started), CCTV batches (Seattle pending; Iowa/HK/Québec/Iceland), NWS alerts, open DEM heights, Overpass offload.
8. **Commit / release / rollback:** Local merge to `main`. Fly deploy image on `eartheye` only. Rollback: prior image `deployment-01M3NYHEW8YQP99Y7K2TTH7RHY` lineage / pre-Stage3 `d6214ef` merge base; volume data survives redeploy.

## Checklist vs STAGE_PLAN

| Item | Status |
| --- | --- |
| 3.1 No straight-line route | **done** |
| 3.2 Typed console ~30 schemas | **done** (radio excluded) |
| 3.3 track/select_nearest completion | **done** |
| 3.4 Drawing / measure | **emulation smoke**; physical iPhone open |
| 3.5 Analyst + registry gate + provenance | **done** |
| 3.6 Directions honesty | **done** (pre-existing + verified) |
