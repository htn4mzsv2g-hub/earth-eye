# EE-PARITY-RESIL-01 — CelesTrak GP/OMM resilience and honesty

**Ticket:** EE-PARITY-RESIL-01  
**Date:** 2026-09-29  
**Base:** Fly v66 known-good `b846a3e0557bc879142aef69c2babd812757a9fc` (`b846a3e`)  
**Deploy:** none. No Fly release.

Freeze files were not edited (`loader`, `loadingScreen`, `graphicsRecovery`, `globeGesture`, `globeInteract`, `startupChrome`, world-overlay pointer-events, `#loading-screen` CSS).

## What changed

CelesTrak often answers HTTP 502 from this network. The satellites layer now keeps that failure visible and only draws positions that come from real element sets.

- The proxy requests CelesTrak **GP / OMM** (`gp.php?FORMAT=json`). A body is cached only when it is a GP catalog array. HTML, empty arrays, and a partial `1 ` line are not stored and are not turned into satellites.
- A real cached CelesTrak copy after an upstream failure is `x-tle-cache: STALE-ERROR` with `x-tle-fetched-at`. The layer chip reads **FALLBACK** and includes that fetch time plus the element epoch. It does not read as a fresh live catalog.
- No cache and no catalog: chip and capability class are **UNAVAILABLE** / **BROKEN**. Pass prediction returns `no-tle`. No orbit is invented.
- A later total outage keeps the previous catalog on screen but the chip stays **UNAVAILABLE**, with the cached copy’s fetch time and element epoch in the source line. It does not fall back to “just now”.
- When elements load, a satellite can be selected by name or NORAD id, `getSatelliteOrbitTrack` returns a propagated path, and the next pass is marked `telemetry: false` / `basis: sgp4-elements`. The tracked card and the layer chip say **SGP4 prediction, not telemetry**, with the element epoch.
- AMSAT two-line elements stay **opt-in** (`TLE_AMSAT_FALLBACK=1`, default off) and only for the `stations` group. When enabled they are `x-tle-source: amsat-fallback` and the chip reads **FALLBACK**. Other groups stay failed.

Positions are SGP4 propagations of those elements. A pass is a prediction from the same elements, not telemetry.

## How to verify

```bash
node --test \
  src/layers/satellites/resilience.test.mjs \
  src/layers/satellites/source.test.mjs \
  src/layers/satellites/ommParse.test.mjs \
  src/tooling/spaceProviders.test.mjs \
  src/proxyErrorResponses.test.mjs \
  src/atlas/dataSourceRegistry.test.mjs \
  src/data/satellitePass.test.mjs \
  src/data/satellites.analyst.test.mjs \
  src/data/satellitesTrackedRefresh.test.mjs
```

Covered paths: GP success (select + orbit + pass), HTML/502 with no elements (UNAVAILABLE, no pass), stale cache (FALLBACK + fetch time), retained catalog after a later outage (UNAVAILABLE + age, not nominal), AMSAT opt-in label, and AMSAT left off by default.

This run used Node v22.14.0. `package.json` asks for Node 24; these files passed on v22.
