# EE-LIVE-3 — LIVE EARTH startup preset

**Shipped:** 2026-09-29 (America/Chicago)  
**Directive:** LIVE_WORLD Phase 5 + FINAL ENGINEERING authenticity rules  
**Findings:** [`EE_LIVE_3_FINDINGS.md`](./EE_LIVE_3_FINDINGS.md)  
**Rollback tip:** Fly **v46** `registry.fly.io/eartheye:deployment-01M3PBZDAY3DHAY5V29FGQGBJC`

## Production

| Item                | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| App                 | `eartheye`                                                                   |
| Fly release         | **v47** (complete)                                                           |
| Image               | `registry.fly.io/eartheye:deployment-01M3PCJF2NJHTJ02VGFRPVCQCG`             |
| Health              | `GET https://eartheye.us/healthz` → `{"ok":true}`                            |
| Auth gate           | unauthenticated `/` → **401**; `/login` → **200** with CURRENTLY UNAVAILABLE |
| Photoreal / billing | untouched                                                                    |
| LOGIN_*             | untouched                                                                    |

## Delivered

1. Fresh-default startup now progressively selects a small view-appropriate set from existing USGS earthquakes, NOAA active cyclones, state-scoped NWS alerts, viewport-scoped WFIGS fire perimeters, and viewport aircraft.
2. Authored share/local state remains authoritative; LIVE EARTH selection is passive and non-durable.
3. Compact status chip reports active/unavailable **sources**, never invented activity.
4. Mobile omits the high-cost CCTV catalog. Desktop also defers CCTV auto-start to LIVE-4 because existing initialization is global rather than nearby-ranked.
5. WFIGS acquisition is bounded end to end by a validated ≤12° viewport envelope.
6. NWS now participates correctly in the data-manager lifecycle with a 90 s cadence and state-scoped startup fetch.

## Tests / checks

- LIVE-3 focused: **36 pass / 0 fail**
  - `src/atlas/liveEarthPreset.test.mjs`
  - `src/atlas/liveEarthController.test.mjs`
  - `src/layers/nwsAlerts/source.test.mjs`
  - `src/layers/perimeters/source.test.mjs`
  - `src/data/firePerimetersProxy.test.mjs`
- Fire perimeter + NWS suites: **67 pass / 0 fail**
- Share restoration / shell lifetime / markup / mobile integration: **59 pass / 0 fail**
- Production build: pass.
- `git diff --check`: pass.
- Full dirty-branch suite: **5,262 pass / 157 pre-existing failures**; see findings.
- Boundary check: pre-existing `src/loadingFeedback.js` browser-global ownership failure.

## Rollback

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PBZDAY3DHAY5V29FGQGBJC
```

## Stop

EE-LIVE-3 only. STOP before camera ranking/LIVE-4 and Analyst/LIVE-5.
