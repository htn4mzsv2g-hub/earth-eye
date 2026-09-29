# EE-LIVE-3 — Findings (LIVE EARTH startup preset)

**Recorded:** 2026-09-29 ~5:50 AM CDT  
**Scope:** LIVE_WORLD Phase 5 + FINAL ENGINEERING authenticity rules only.  
**Shipped as Fly v47** `registry.fly.io/eartheye:deployment-01M3PCJF2NJHTJ02VGFRPVCQCG`.

**Rollback tip:** Fly **v46** `registry.fly.io/eartheye:deployment-01M3PBZDAY3DHAY5V29FGQGBJC`.

## Finding

A legitimate fresh open restored no authored layer state and enabled no live source. The globe could therefore read as empty even while Earth Eye already had current official feeds. The fix is a passive startup policy, not a simulated “busy” mode: it selects a few existing feeds by camera scale, geography, and device cost, then enables them progressively.

## Startup source policy

| Current opening view                | Auto-started existing sources                                                                     | Reason                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Global                              | USGS recent earthquakes; NOAA NHC/CPHC active cyclones                                            | Small, keyless, official global signals; zero records remains honest |
| Regional over supported CONUS state | Global signals + state-bounded NWS active alerts + viewport-bounded WFIGS current fire perimeters | Relevant official hazards without a nationwide object dump           |
| Metro/city/street                   | USGS + viewport-bounded aircraft; CONUS adds NWS/WFIGS                                            | Existing aircraft query is view-bounded; no global flight pull       |
| Compact/mobile local                | Same low/medium-cost policy; CCTV omitted                                                         | Protect bandwidth/GPU and startup latency                            |

The existing CCTV layer initializes a multi-provider global catalog and can include thousands of records. LIVE-3 therefore records CCTV as a candidate but does **not** auto-start it. Nearby camera ranking is explicitly reserved for LIVE-4; LIVE-3 does not smuggle in that rewrite.

## Authenticity / ownership rules

- Runs only for `defaults` on a fresh open.
- Never overrides a v2 share, legacy camera/style share, or a saved local authored layer state — including an intentionally empty saved state.
- Uses manager origin `live-earth-preset`, which is not a durable user-intent origin. Startup choices are not written into the user's saved/share layer selection.
- The chip reports source state, not event/object count: `LIVE EARTH · N SOURCES ACTIVE · M UNAVAILABLE`.
- A source with zero records is still an active, honest source. Failed enable/refresh state is unavailable; no events, aircraft, fires, alerts, cameras, or counts are fabricated.
- Uses only existing Earth Eye sources. No EE-EVENTS / World Events stack was introduced.

## Progressive and bounded loading

- Sources enable in cheapest/highest-signal order with a 220 ms gap.
- Fire perimeter requests now require a non-dateline viewport rectangle no larger than 12° × 12°. An unsuitable globe/horizon view skips the fetch instead of falling back to a nationwide payload.
- The fire proxy validates the bbox, scopes the ArcGIS query with an envelope/intersection filter, and caches by rounded bbox.
- NWS startup requests are bounded to a selected two-letter state. Views for which LIVE-3 cannot safely derive a supported state skip NWS rather than requesting every U.S. alert.
- Existing aircraft requests retain their viewport query. Global altitude never auto-starts aircraft.
- Existing USGS and NOAA active-cyclone feeds are bounded upstream products with low object counts/cadence.

## Engineering findings

- The NWS layer still used an obsolete `attach()` lifecycle and was not manager-compatible. It now implements `init/enable/update/disable/destroy`, manager-owned 90 s refresh, stats, and state-area selection.
- The current dirty integration branch has broad pre-existing test/format/boundary failures from work outside LIVE-3. Full `npm test` reported 5,262 pass / 157 fail; none of the failure titles referenced LIVE EARTH, NWS, or fire perimeter behavior. The existing boundary failure is `src/loadingFeedback.js: feed state reaches browser globals: window`; formatter scope also contains many pre-existing unformatted files.

## Explicit non-goals

No Cesium rewrite, Google Photoreal/billing work, LOGIN_* changes, EE-EVENTS, camera ranking/LIVE-4, or Analyst/LIVE-5 completion.
