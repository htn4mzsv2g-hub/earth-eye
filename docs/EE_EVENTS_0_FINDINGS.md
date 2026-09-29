# EE-EVENTS-0 — Findings (World Events foundation)

**Recorded:** 2026-09-29 ~6:20 AM CDT  
**Scope:** LIVE_WORLD Phase 8 / EE-EVENTS-0 — normalized event contract + registry ONLY.  
**Shipped as Fly v50** `registry.fly.io/eartheye:deployment-01M3PDN3MB6XBCHTJEGRG56SD9`.

**Rollback tip:** Fly **v49** `registry.fly.io/eartheye:deployment-01M3PD8ABXGDYWVFT0VXWXYTC1`.

## Finding

Earth Eye already has event-like layers (NWS alerts, USGS quakes, FIRMS detections, WFIGS perimeters, NOAA cyclones) but they do not share a provider-qualified event identity, kind vocabulary, precision honesty, or revision/related-ref structure. There is no registry of event types, so later GDACS / ReliefWeb / GDELT work would have nowhere honest to land. City-level news and zone-only alerts can be mistaken for precise points; news headlines can be mistaken for sensor facts.

## Contract (UPSTREAM §12)

Normalized World Event fields:

1. Stable provider-qualified `eventId` (`provider:id`) + `sources[]`
2. `kind` enum: OFFICIAL ALERT | OFFICIAL REPORT | HUMANITARIAN REPORT | NEWS REPORT | PUBLIC DATA OBSERVATION | EARTH EYE ANALYSIS
3. Source-specific `severity` (nullable; never invented)
4. Geometry + `precision` (`point` | `polygon` | `multipolygon` | `bbox` | `region` | `unknown`) — region/unknown cannot carry Point coordinates
5. Event time + uncertainty; `firstReported`, `lastUpdated`, `retrievedAt`, `expiry`, `revisionState`
6. Supporting / contradictory report refs (structure only)
7. Related places / entities / cameras / weather / roads / hazards (structure; `causal` always false)
8. Coverage limits + confidence only when the source provides them
9. Attribution + source links

## Registry

- Existing-layer adapters (`ACTIVE` in-memory normalizers): NWS, USGS, FIRMS, WFIGS, NOAA cyclones. **Do not replace layers.**
- Tier hooks (`HOOK_ONLY`, no fetch): GDACS, ReliefWeb, GDELT (NEWS REPORT discovery only).
- Honest health: READY / EMPTY / DEGRADED / NO DATA / NOT WIRED / OFFLINE / ERROR. Empty is not "nothing happened."

## Authenticity

- No fabricated observations.
- News ≠ sensor facts (GDELT is NEWS REPORT, not PUBLIC DATA OBSERVATION).
- City/region geography stays imprecise (NWS areaDesc, USGS place-only, perimeter without polygon → `region`).
- Related refs are not causal proof.

## Explicit non-goals

EE-EVENTS-1 live source wiring, globe markers, detail panels, FOLLOW EVENT, Analyst event tools, Cockpit, ATC audio, Photoreal billing, Cesium rewrite, synthetic traffic.
