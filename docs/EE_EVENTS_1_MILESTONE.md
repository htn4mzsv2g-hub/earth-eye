# EE-EVENTS-1 — Tiered source adapters + health/failure states

**Shipped:** 2026-09-29 (America/Chicago)  
**Directive:** LIVE_WORLD EE-EVENTS-1 + UPSTREAM §12 authenticity + PRODUCTION QUALITY / AI-NATIVE CHARTER  
**Findings:** [`EE_EVENTS_1_FINDINGS.md`](./EE_EVENTS_1_FINDINGS.md)  
**Rollback tip:** Fly **v50** `registry.fly.io/eartheye:deployment-01M3PDN3MB6XBCHTJEGRG56SD9`

## Production

| Item | Value |
| --- | --- |
| App | `eartheye` |
| Fly release | **v53** (complete) |
| Image | `registry.fly.io/eartheye:deployment-01M3PE7SXQ5SVFTMVKY7TQNMBP` |
| Health | `GET https://eartheye.us/healthz` → `{"ok":true}` |
| Auth gate | unauthenticated `/` → **401**; `/login` → **200** |
| Status | `GET /api/atlas/world-events/status` (session-gated like other atlas APIs) |
| Events list | `GET /api/atlas/world-events` (session-gated, bounded) |
| Photoreal / billing | untouched |
| LOGIN_* | untouched |

## Live smoke (local orchestrator vs real upstreams, 2026-09-29 ~6:19 AM CDT)

| Source | Tier | Health | Notes |
| --- | --- | --- | --- |
| nws-alerts | A | READY | capped |
| usgs-earthquakes | A | READY | capped |
| nasa-firms | A | **NEEDS KEY** | no key → upstream not contacted |
| wfigs-perimeters | A | READY | capped |
| noaa-cyclones | A | READY | |
| gdacs | B | READY | attributed GDACS |
| reliefweb | B | **PERMISSION HELD** | no scrape |
| gdelt | C | **RATE LIMITED** | honest 429, not fake empty LIVE |

Overall live health **DEGRADED** when any source is NEEDS KEY / PERMISSION HELD / RATE LIMITED alongside READY — never silent empty pretending LIVE.

## Delivered

1. Tier A live adapters reusing EE upstreams → validated World Event records (caps).
2. Tier B: GDACS fetch + attribution; ReliefWeb **PERMISSION HELD**.
3. Tier C: GDELT NEWS REPORT only; region/unknown; never OFFICIAL ALERT.
4. Per-source health vocabulary: READY / EMPTY / DEGRADED / NO DATA / OFFLINE / NEEDS KEY / RATE LIMITED / PERMISSION HELD / TERMS UNCLEAR / NEEDS REVIEW.
5. Optional read-only `/api/atlas/world-events`. No globe markers.
6. Unit tests for adapters + health; no fabricated / demo events.

## Tests / checks

- `src/events/worldEventContract.test.mjs`
- `src/events/eventRegistry.test.mjs`
- `src/events/adapters/adapters.test.mjs`
- `src/events/adapters/tierAdapters.test.mjs`
- `server/providers/worldEvents/orchestrator.test.mjs`
- `server/providers/capabilities.test.mjs`

## Rollback

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PDN3MB6XBCHTJEGRG56SD9
```

## Stop

EE-EVENTS-1 only. STOP before EE-EVENTS-2 (no globe markers / detail panels / FOLLOW).
