# EE-LIVE-4 — Findings (camera relevance ranking)

**Recorded:** 2026-09-29 ~5:55 AM CDT  
**Scope:** LIVE_WORLD Phase 6 + FINAL ENGINEERING camera authenticity rules + UPSTREAM RECONCILIATION selection notes (cameras).  
**Shipped as Fly v48** `registry.fly.io/eartheye:deployment-01M3PCXE33QXK01361QFPXHHR1`.

**Rollback tip:** Fly **v47** `registry.fly.io/eartheye:deployment-01M3PCJF2NJHTJ02VGFRPVCQCG`.

## Finding

Opening CAMERAS while the globe was over Austin could list public cameras about **1,850+ km** away (other U.S. packs / overseas) as a continuous wall with no explanation. The catalog sort was only “nearest to view center” over the **entire** multi-provider catalog, so distance labels were present but relevance was not enforced.

## Ranking contract (default)

Pure model in `src/atlas/cctvCatalog.js` (`rankCameras`):

1. **IN CURRENT VIEW** — camera lat/lon inside the Cesium view rectangle
2. **NEAREST TO VIEW CENTER** — great-circle km to the pick/globe center
3. **NEAREST TO SELECTED LOCATION** — shared entity context lat/lon when present
4. **Quality / media type** when center distance is comparable (≤ 2 km): live → clip → still → none

Useful-nearby radius is derived from the view diagonal (×1.25), else altitude FOV, else 80 km, and **clamped to 25–200 km** so a globe-scale rectangle cannot reopen a worldwide list.

Default browse mode (`sort=near`, no text query, no provider filter) drops cameras outside that radius (unless in-view). Empty result copy:

`NO PUBLIC CAMERAS FOUND IN THIS AREA`

Explicit search or provider filter may include distant cameras (user asked); distances remain honest. Labels preserved: **LIVE VIDEO / VIDEO CLIP / REFRESHED STILL / STILL IMAGE ONLY**. Stills are never relabeled as live. No fake cameras. No ALPR.

## Wiring

- `cctvBrowser` uses `rankCameras` for the default list; cards show distance and an `IN VIEW` hint.
- `console.js` supplies `cameraBounds` (`computeViewRectangle`), `cameraAltitudeM`, and `selectedLocation` (`getSelectedEntityContext`).

## LIVE EARTH (optional desktop CCTV)

LIVE-3 deferred CCTV because layer **init still loads the full catalog**. LIVE-4 fixes **list** ranking only. Enabling CCTV on LIVE EARTH would still pull the global pack into memory/entities, so **auto-start remains off** until a nearby-scoped catalog load exists. Documented on the `cctv` LIVE EARTH candidate.

## Explicit non-goals

No Cesium rewrite, Photoreal/billing, LOGIN_*, World Events, Analyst/LIVE-5, Cockpit feature build.
