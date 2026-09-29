# NAV-2 milestone — TomTom Orbis free-tier route provider (NEEDS_KEY until owner secret)

Date: 2026-09-29 ~3:15 AM CT (America/Chicago)

## 1. Users can do
- Call `/api/route` with honest provider labels: **OSRM DEMO_FAIR_USE** when `TOMTOM_API_KEY` unset (`needsKey: true`); **TomTom Orbis LIVE** for car when key set and under budget.
- Inspect `/api/route/status` for provider selection + monthly free-tier budget snapshot (no secrets).
- Foot/bike stay on OSRM demo when key present (Orbis GA is car-first) unless `EE_TOMTOM_ALL_PROFILES=1`.

## 2. Fixed / shipped
- Pluggable `routeProvider` behind `/api/route` (OSRM | TomTom Orbis). **Mapbox not wired.**
- Hard monthly governor: routing 20K, tiles 200K, incident-details 2.5K (env overrides). Fail honest at cap (`tomtom_budget` / stale tiles).
- TomTom adapter + attribution; traffic proxy also checks monthly tile cap.
- No Google/Apple Cesium route geometry. No Waze. No fake traffic. No key created by agent.

## 3. Providers verified
- Unit tests mock TomTom + OSRM. Live key **not** installed (owner step). Caps match owner free-tier numbers.

## 4. Tests
- 8/8 `routeProvider.test.mjs`; 20/20 placeProviders+geospatial; Stage 5.3 retention suite green.

## 5. Perf
- Route cache still 10 min; TomTom counted only on upstream success path; tile cache hits do not count.

## 6. Limits
- Key unset → NEEDS_KEY / DEMO_FAIR_USE. Owner must `fly secrets set TOMTOM_API_KEY=…` separately.
- Mapbox forbidden for now. Broadcastify HELD. LiveATC blocked. No push. Option C unchanged.

## 7. Next
- Deploy this adapter (NEEDS_KEY). Owner installs free-tier key via secure prompt / fly secrets.
- Then verify LIVE car route under budget on eartheye.us.

## 8. SHA / release / rollback
- Branch: `stage5-incident-workspaces`
- SHA: `c8c40db`
- Release: **Fly v24** live — image `registry.fly.io/eartheye:deployment-01M3P391YT9CAX56QSBD8JTY9D` (~3:10 AM CT). NEEDS_KEY (no TOMTOM_API_KEY secret yet). Verified healthz 200; route/status + route + permitted-history 401 unauth; signup 403. Option C unchanged. No push.
- Rollback: Fly v23 `registry.fly.io/eartheye:deployment-01M3P32FM14CPM8HV9N0QF1Z7G`
