# EE-EVENTS-3 — Findings (Event detail + RELATED)

**Recorded:** 2026-09-29 ~6:45 AM CDT  
**Scope:** LIVE_WORLD EE-EVENTS-3 — event detail + related data (no false causation) ONLY.  
**Base tip / rollback:** Fly **v55** `registry.fly.io/eartheye:deployment-01M3PF6A8C16K7RCZZV5T9265S`

## Finding

EE-EVENTS-2 gave markers, filters, and compact disclosure, but operators still lacked a full provenance panel and RELATED conditions. Selection card said “disclosure only.”

## Architecture

| Piece | Role |
| --- | --- |
| `src/events/live/detail.js` | Full detail model: name/id, kind, sources, attribution links, event/retrieved/published times, geometry honesty, severity (null if absent), status/revision |
| `src/events/live/related.js` | RELATED cameras (place/radius; never fake IN VIEW without viewport) + weather/alerts/aircraft/fires only when real EE rows supplied |
| `src/events/live/panel.js` | Renders detail + RELATED; map actions FLY TO / SHOW ON GLOBE |
| `src/events/live/controller.js` | Loads related inputs on select; `rendererDown` → UNAVAILABLE |
| `src/atlas/selectionCard.js` | DETAILS opens EVENTS detail; FLY TO map-dependent / UNAVAILABLE when graphics failed |
| Shared identity | `layerId: world-events` (LIVE-5 Analyst contract unchanged) |

## Authenticity

- RELATED banner + per-item badges — never CAUSED BY / never causalClaim true.
- Cameras ranked with selected place + radius; `bounds` null in non-3D so `_inView` stays false.
- Weather/alerts/aircraft/fires omitted unless loaded EE `getNearby` rows exist.
- Severity stays `null` when source did not provide it.
- Map actions → UNAVAILABLE with explanation when renderer down or no plottable anchor.
- Works in non-3D (`?ee_non3d=1`) without Cesium.

## Explicit non-goals

EE-EVENTS-4/6 FOLLOW, Analyst event tools expansion, Cockpit, Photoreal billing, CSP weaken, mock data.
