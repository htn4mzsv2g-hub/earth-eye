# Milestone — Google Photoreal prep (billable OFF)

Date: 2026-09-29 ~4:25 AM CT

**Fly:** v41 `registry.fly.io/eartheye:deployment-01M3P7H3W5449CGHRAQ6GZ0KEZ` (commit `9630c1e`) — Google/ion build secrets **absent** (Photoreal OFF)
**Rollback:** Fly v40 / git `d633842` — see `GOOGLE_PHOTOREAL_ROLLBACK.md`

## Shipped
1. Rollback note: git `d633842` / Fly **v40** (`docs/GOOGLE_PHOTOREAL_ROLLBACK.md`)
2. Setup doc + earth-eye-spec mirror (`GOOGLE_PHOTOREAL_SETUP.md`)
3. Stack order helper + honest status: `GLOBE_STACK_PRIORITY`, `describePhotorealStatus`, route `none` → Esri (not silent OSM)
4. Keys UI: unlock copy + Globe status banner from `__eePhotorealStatus`
5. Deploy **without** Google/ion build secrets → Photoreal remains OFF
6. No push. Option C unchanged. AUTH untouched. No invented keys.

## Not done (blocked on owner)
- Enabling billable Google/ion until owner approves + supplies keys via Keys flow or build-secret deploy
- iPhone retina polish after Photoreal actually works
