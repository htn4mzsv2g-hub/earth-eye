# EE-EVENTS-0 — World Events foundation (contract + registry)

**Shipped:** 2026-09-29 (America/Chicago)  
**Directive:** LIVE_WORLD EE-EVENTS-0 + UPSTREAM RECONCILIATION §12 + FINAL ENGINEERING authenticity  
**Findings:** [`EE_EVENTS_0_FINDINGS.md`](./EE_EVENTS_0_FINDINGS.md)  
**Rollback tip:** Fly **v49** `registry.fly.io/eartheye:deployment-01M3PD8ABXGDYWVFT0VXWXYTC1`

## Production

| Item | Value |
| --- | --- |
| App | `eartheye` |
| Fly release | **v50** (complete) |
| Image | `registry.fly.io/eartheye:deployment-01M3PDN3MB6XBCHTJEGRG56SD9` |
| Health | `GET https://eartheye.us/healthz` → `{"ok":true}` |
| Auth gate | unauthenticated `/` → **401**; `/login` → **200** |
| Status surface | `GET /api/atlas/world-events/status` (unauthenticated capability path) |
| Capabilities | WORLD EVENTS row on `GET /api/atlas/capabilities` |
| Photoreal / billing | untouched |
| LOGIN_* | untouched |
| Verified | capabilities WORLD EVENTS=AVAILABLE; `/api/atlas/world-events/status` READY (5 active / 3 hooks); liveFetches NOT WIRED |

## Delivered

1. Pure-JS World Event contract (`src/events/worldEventContract.js`) with kinds, precision honesty, times, refs, coverage, attribution.
2. Event registry (`src/events/eventRegistry.js`) with ACTIVE normalizers + HOOK_ONLY tier stubs (no GDACS/ReliefWeb/GDELT fetch).
3. In-memory adapters for existing layers: NWS (OFFICIAL ALERT), USGS / FIRMS / WFIGS (PUBLIC DATA OBSERVATION), NOAA cyclones (OFFICIAL ALERT). Existing Cesium layers unchanged.
4. Honest EMPTY / NOT WIRED health; Keys panel + capabilities + owner-summary status. No globe markers.
5. Unit tests: contract validation, precision (no fake points), kind enum, NWS + USGS + FIRMS + perimeter + cyclone normalizers, registry health.

## Tests / checks

- `src/events/worldEventContract.test.mjs`
- `src/events/eventRegistry.test.mjs`
- `src/events/adapters/adapters.test.mjs`
- `server/providers/capabilities.test.mjs`

## Rollback

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PD8ABXGDYWVFT0VXWXYTC1
```

## Stop

EE-EVENTS-0 only. STOP before EE-EVENTS-1 (no live GDACS / ReliefWeb / GDELT wiring).
