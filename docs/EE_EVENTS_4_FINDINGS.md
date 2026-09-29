# EE-EVENTS-4 — Findings (Analyst event queries + same-state actions)

**Recorded:** 2026-09-29 (America/Chicago)  
**Scope:** UPSTREAM/LIVE_WORLD EE-EVENTS-4 only. Base Fly tip: **v56** (`deployment-01M3PFGP98Z97PBJPZAVSP1BGV`).

**Deployed:** Fly **v57**, image `registry.fly.io/eartheye:deployment-01M3PFRJK7KJW6955G5AKXH6XN`.

## Delivered

- Analyst `event_detail` queries the selected World Event and returns the EE-EVENTS-3 detail/provenance model with the same `world-events` identity.
- Analyst `related_cameras` ranks real camera-catalog rows through the existing `rankCameras` path, bounded by event coordinates/radius; no cameras are invented and RELATED is never causal.
- Analyst `open_event_detail` opens the existing World Events detail panel/state. `show_layer` only operates on the existing World Events marker controller.
- Map-dependent Analyst actions return `UNAVAILABLE` when the 3D renderer is unavailable; opening/querying detail remains usable in non-3D.
- Terminal results remain `SUCCESS` / `PARTIAL` / `FAILED` / `UNAVAILABLE` from execution.

## Explicit non-goals

No FOLLOW notifications or retention, history/retractions, Photoreal, CSP, mocks, or new event source/API work.

## Focused verification

- `node --test src/atlas/analystTools.test.mjs` — 23 passing (including 3 EE-EVENTS-4 cases).
- `node --test src/events/live/eventsDetail3.test.mjs src/events/live/eventsUx.test.mjs` — 20 passing.
- Production: `/healthz` 200 (`{"ok":true}`), `/` 401, `/login` 200; Fly v57 machine checks passing.
