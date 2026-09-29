# EE-EVENTS-3 — Event detail + RELATED (no false causation)

**Shipped:** 2026-09-29 (America/Chicago)  
**Directive:** LIVE_WORLD EE-EVENTS-3 + UPSTREAM §12 authenticity + PRODUCTION QUALITY charter  
**Findings:** [`EE_EVENTS_3_FINDINGS.md`](./EE_EVENTS_3_FINDINGS.md)  
**Rollback tip:** Fly **v55** `registry.fly.io/eartheye:deployment-01M3PF6A8C16K7RCZZV5T9265S`

## Production

| Item | Value |
| --- | --- |
| App | `eartheye` |
| Fly release | **v56** (complete) |
| Image | `registry.fly.io/eartheye:deployment-01M3PFGP98Z97PBJPZAVSP1BGV` |
| Health | `GET https://eartheye.us/healthz` → `{"ok":true}` |
| Auth gate | unauthenticated `/` → **401**; `/login` → **200** |
| Detail | MORE → **EVENTS** select → full provenance + RELATED |
| Non-3D | `?ee_non3d=1` — detail works; FLY TO / SHOW ON GLOBE → UNAVAILABLE |
| Photoreal / billing | untouched |
| LOGIN_* / CSP | untouched |
| Verified | healthz ok; `/` 401; `/login` 200; machine v56 checks passing |

## Delivered

1. Event detail surface (name/id, kind, sources, attribution links, times, precision/geometry honesty, severity null-safe, status/revision).
2. RELATED conditions: nearby cameras (place/radius, no fake IN VIEW); weather/alerts/aircraft/fires only with real EE data — labeled RELATED not CAUSED BY.
3. Shared selection identity `world-events` for Analyst.
4. Non-3D coexistence (v55 graphics recovery).
5. Map-dependent actions → UNAVAILABLE with explanation when renderer down.
6. Tests: `src/events/live/eventsDetail3.test.mjs`.

## Tests / checks

- `src/events/live/eventsDetail3.test.mjs`
- `src/events/live/eventsUx.test.mjs`
- Production build + deploy healthz / auth gate

## Rollback

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PF6A8C16K7RCZZV5T9265S
```

## Stop

EE-EVENTS-3 only. STOP before EE-EVENTS-4 FOLLOW.
