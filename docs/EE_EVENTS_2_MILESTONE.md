# EE-EVENTS-2 — Event UX on GLOBE / filters / source+time disclosure

**Shipped:** 2026-09-29 (America/Chicago)  
**Directive:** LIVE_WORLD EE-EVENTS-2 + UPSTREAM §12 authenticity + PRODUCTION QUALITY charter  
**Findings:** [`EE_EVENTS_2_FINDINGS.md`](./EE_EVENTS_2_FINDINGS.md)  
**Rollback tip:** Fly **v53** `registry.fly.io/eartheye:deployment-01M3PE7SXQ5SVFTMVKY7TQNMBP`

## Production

| Item | Value |
| --- | --- |
| App | `eartheye` |
| Fly release | **v54** (complete) |
| Image | `registry.fly.io/eartheye:deployment-01M3PEW4KQQ6ZC1V00HM0C2C8J` |
| Health | `GET https://eartheye.us/healthz` → `{"ok":true}` |
| Auth gate | unauthenticated `/` → **401**; `/login` → **200** |
| Events UX | MORE → **EVENTS** (desktop + mobile GLOBE group) |
| API | `GET /api/atlas/world-events` + `/status` (unchanged; feeds client) |
| Photoreal / billing | untouched |
| LOGIN_* | untouched |
| Verified | healthz ok; `/` 401; `/login` 200; markers soft-fail if viewer/WebGL dead |

## Delivered

1. Bounded globe markers (CustomDataSource + world-overlay cohort, cap 64) for registry events with honest anchors.
2. Filters by kind (OFFICIAL ALERT / PUBLIC DATA OBSERVATION / HUMANITARIAN / NEWS REPORT), tier A/B/C, and source — NEWS ≠ OFFICIAL labeling.
3. On select: shared Earth Eye identity (`world-events`) + compact disclosure (source, event time, retrieved, precision, attribution).
4. Empty/degraded: EMPTY / EMPTY_FILTER / DEGRADED / NEEDS KEY / PERMISSION HELD / RATE LIMITED / OFFLINE — never endless SYNCING.
5. No full detail panel (EE-EVENTS-3) and no FOLLOW beyond select+disclosure.

## Tests / checks

- `src/events/live/eventsUx.test.mjs`
- `src/events/worldEventContract.test.mjs`
- `src/events/eventRegistry.test.mjs`
- `src/atlas/canonicalIa.test.mjs`
- `src/atlas/selectionCard.test.mjs`
- Production build + `git diff --check` on touched files

## Rollback

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PE7SXQ5SVFTMVKY7TQNMBP
```

## Stop

EE-EVENTS-2 only. STOP before EE-EVENTS-3 (full event detail panel).
