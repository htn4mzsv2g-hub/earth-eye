# EE-LIVE-5 — Findings (Analyst query vs map-display coherence)

**Recorded:** 2026-09-29 ~6:10 AM CDT  
**Scope:** LIVE_WORLD Phase 7 + FINAL ENGINEERING Analyst rules + UPSTREAM RECONCILIATION Analyst same-state notes.  
**Shipped as Fly v49** `registry.fly.io/eartheye:deployment-01M3PD8ABXGDYWVFT0VXWXYTC1`.

**Rollback tip:** Fly **v48** `registry.fly.io/eartheye:deployment-01M3PCXE33QXK01361QFPXHHR1`.

## Finding

Analyst could answer about nearby cameras/aircraft while using a **separate ranking and selection path** from the globe: camera lists sorted only by distance (not LIVE-4 `rankCameras`), map selection was invisible to Analyst context, `query_entities` refused to run when a display layer was off (conflating QUERY DATA with CHANGE MAP DISPLAY), and tool results only exposed `ok` — so a command could look acknowledged without a truthful SUCCESS / PARTIAL / FAILED / UNAVAILABLE terminal state. AO paid OpenAI remains hard-off (scaffold only).

## Coherence contract

1. **Same selected identity** — Globe selection (`getSelectedEntityContext`) is projected to Analyst as Earth Eye `{ id, type, source }` via `earthEyeIdentity` / `selected_entity`. Analyst panel shows a SELECTED strip; view-centered queries prefer the selected lat/lon when present.
2. **Same viewers** — `select_entity` for cameras calls the existing CAMERAS-tab `cctv.openViewer` only. `openViewer` now returns SUCCESS / PARTIAL / FAILED from actual execution (never opens a different camera; catalog-miss is FAILED).
3. **Deterministic command status** — Every `tools.run` result carries `status`: SUCCESS | PARTIAL | FAILED | UNAVAILABLE derived from execution (truncation, display-off with/without warm records, capability off, errors). Never acknowledge a command that did not run.
4. **Query vs display** — `query_entities` no longer early-returns when display is off; it queries loaded/warm records and never auto-enables a layer. SHOW ON MAP / `set_layer` remains a separate action. `locate_cameras` uses the same `rankCameras` contract as the CAMERAS tab (in-view → center → selected → quality) with empty copy `NO PUBLIC CAMERAS FOUND IN THIS AREA`. Flights / military / earthquakes `getAnalystRecords` may return warm records while display is hidden; `gevActions` `getRecords` no longer requires `isEnabled`.
5. **AO-0 honesty** — `ai_status` reports UNAVAILABLE for paid AI synthesis; deterministic tools still work. No OpenAI billing enabled.

## Wiring

| Piece | Location |
| --- | --- |
| Identity + status helpers | `src/atlas/analystIdentity.js` |
| Tools / parser | `src/atlas/analystTools.js` |
| Panel selection strip + status badges | `src/atlas/analystPanel.js` |
| Console deps (selection, bounds, altitude, openCamera) | `src/atlas/console.js` |
| Shared viewer result | `src/atlas/cctvBrowser.js` `openViewer` |
| Query without display ON | `src/voice/gevActions.js` + flights/military/earthquakes `getAnalystRecords` |

## Explicit non-goals

No Cesium rewrite, Photoreal/billing, LOGIN_*, EE-EVENTS build, Cockpit FPV feature build, ATC audio / Broadcastify (still PERMISSION REQUIRED), synthetic traffic.
