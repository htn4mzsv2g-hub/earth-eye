# EE-EVENTS-2 — Findings (Event UX on GLOBE)

**Recorded:** 2026-09-29 ~6:30 AM CDT  
**Scope:** LIVE_WORLD EE-EVENTS-2 — globe markers / filters / source+time disclosure ONLY.  
**Base tip:** Fly **v53** `registry.fly.io/eartheye:deployment-01M3PE7SXQ5SVFTMVKY7TQNMBP` (EE-EVENTS-1).

## Finding

EE-EVENTS-0/1 delivered the World Event contract, registry, and live Tier A/B/C adapters with honest health, but the operator had no GLOBE surface: no markers, no kind/tier/source filters, and no shared selection disclosure. Keys still said “No globe markers (EE-EVENTS-2).”

## Architecture

| Piece | Role |
| --- | --- |
| `src/events/live/filters.js` | Kind/tier/source filters; NEWS kept distinct from OFFICIAL |
| `src/events/live/cohort.js` | Bounded marker cohort (cap 64); region/unknown never plotted |
| `src/events/live/disclosure.js` | Compact source + event time + retrieved + precision + attribution |
| `src/events/live/selectionBridge.js` | World Event → shared Earth Eye identity (LIVE-5 contract) |
| `src/events/live/client.js` | Discrete LOADING → terminal health (never endless SYNCING) |
| `src/events/live/panel.js` | MORE → EVENTS list + filters + disclosure |
| `src/events/live/markers.js` | CustomDataSource points + world-overlay labels (no Cesium rewrite) |
| `src/events/live/controller.js` | Fetch → filter → cohort → select |

Entry points: desktop MORE → **EVENTS**; mobile MORE → GLOBE → **EVENTS**. Markers default ON (toggleable). Selection publishes `layerId: world-events` into contextStore; selection card shows disclosure hint (no EE-EVENTS-3 detail / no FOLLOW).

## Authenticity

- NEWS REPORT labeled distinctly — never collapsed into OFFICIAL ALERT.
- City/region/unknown geography stays list-only (no invented precise points).
- Polygon/bbox markers use source-geometry extent center only.
- Empty / DEGRADED / NEEDS KEY / PERMISSION HELD / RATE LIMITED are explicit.
- Related refs remain non-causal in disclosure copy.
- No fabricated events; registry/adapters unchanged in truthfulness.

## Explicit non-goals

EE-EVENTS-3 full event detail panel, EE-EVENTS-4/6 FOLLOW, Analyst event tools, Cockpit, ATC audio, Photoreal billing, Cesium rewrite.

## Graphics-recovery coexistence

Markers attach lazily and soft-fail when `viewer` is destroyed / missing `scene` / `dataSources` (WebGL/Cesium init failure). List + filters + disclosure still load from `/api/atlas/world-events`. No edits to `main.js` / `mapStartup.js` / loading chrome — leaves hooks for the dedicated graphics-failure UI executor.
