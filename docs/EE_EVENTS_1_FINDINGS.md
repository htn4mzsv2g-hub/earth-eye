# EE-EVENTS-1 — Findings (tiered source adapters + health)

**Recorded:** 2026-09-29 ~6:20 AM CDT  
**Scope:** LIVE_WORLD EE-EVENTS-1 — Tier A/B/C adapters + honest health/failure states ONLY.  
**Base tip:** Fly **v50** `registry.fly.io/eartheye:deployment-01M3PDN3MB6XBCHTJEGRG56SD9` (EE-EVENTS-0).
**Shipped as Fly v53** `registry.fly.io/eartheye:deployment-01M3PE7SXQ5SVFTMVKY7TQNMBP`.

## Finding

EE-EVENTS-0 delivered the contract + registry + in-memory normalizers, but live Tier A reuse and Tier B/C wiring were still NOT WIRED. Status could not distinguish NEEDS KEY / PERMISSION HELD / RATE LIMITED / OFFLINE from a silent empty LIVE. ReliefWeb and GDACS terms needed review before any fetch.

## Terms review (before fetch)

| Source | Verdict | Action |
| --- | --- | --- |
| **Tier A** (NWS, USGS, WFIGS, NOAA cyclones) | Already in EE; keyless public / public domain | Live fetch + normalize via existing adapters |
| **NASA FIRMS** | Needs `FIRMS_MAP_KEY` | Live when key set; else **NEEDS KEY** (upstream not contacted) |
| **GDACS** | Public API; acknowledge “Global Disaster Alert and Coordination System, GDACS”; does not replace national alerts | **Fetch wired** with attribution + coverage note |
| **ReliefWeb** | Site T&C: personal/non-commercial Materials; API “anyone can use” but **appname pre-approval** required since 2025-11-01 | **PERMISSION HELD / NEEDS REVIEW** — no fetch, no scrape |
| **GDELT** | Unrestricted academic/commercial/gov with citation (already in DATA_SOURCES / regional brief) | **Fetch wired** as **NEWS REPORT** only; region/unknown precision |

## Authenticity

- News ≠ sensor: GDELT → NEWS REPORT only; never OFFICIAL ALERT.
- No invented precise points from city/country geocode (GDELT stays `region`).
- GDACS model points are source-provided; coverage states they do not replace national authorities.
- Empty / NEEDS KEY / PERMISSION HELD / OFFLINE / RATE LIMITED / DEGRADED are explicit — never silent empty pretending LIVE.
- No fabricated events.

## Architecture

- Normalizers: `src/events/adapters/*` (Tier A existing + `gdacs.js` + `gdelt.js` + `reliefweb.js` hook).
- Live acquisition: `server/providers/worldEvents/` (orchestrator + per-source fetchers, TTL cache, global cap).
- Status: `GET /api/atlas/world-events/status` includes `live.sources[]` health.
- Optional list: `GET /api/atlas/world-events` (session-gated like other atlas data APIs).

## Explicit non-goals

EE-EVENTS-2 markers UX, detail panels, FOLLOW, Analyst event tools, Cockpit, ATC audio, Photoreal billing, Cesium rewrite.
