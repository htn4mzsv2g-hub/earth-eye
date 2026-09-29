# EE-LIVE-1 — Defect findings (Phase 1)

**Recorded:** 2026-09-29 ~5:28 AM CDT  
**Scope:** loaders, timezone, CT CT, ADS-B contradiction, dead controls only.  
**Rollback tip:** Fly v44 `registry.fly.io/eartheye:deployment-01M3P9HQVJXPVTM52MJJCR40GE` (`docs/EE_LIVE_0_ROLLBACK.md`).

## 1) Permanent "SYNCING ROAD NETWORK"

| Item | Detail |
| --- | --- |
| UI | `#traffic-sync-chip` / `#traffic-sync-label` (`scene-chrome.html`) |
| Reducer | `reduceTrafficSyncFeedback` in `src/loadingFeedback.js` |
| Writer | `ShellFeedback._updateTrafficSyncChip` (`src/ui/shellFeedback.js`) |
| Layer stats | Traffic `getStats()` → `loading = _fetching \|\| _flowPending > 0`, `loadingLabel` from `trafficFeedPresentation` |
| Root cause | Chip stays `busy` while `stats.loading` (or unfinished phase progress) never clears. Fallback label when busy+empty is literally `"syncing road network"`. No max-busy terminal — can spin forever if OFM/TomTom/flow pending sticks. |
| Fix | Cap busy duration; settle to truthful terminal (READY / DEGRADED / NEEDS KEY / NO COVERAGE / OFFLINE / NO DATA) from stats; clear HTML defaults so a non-visible chip cannot read as syncing. |

## 2) Permanent "LOADING FRAMES 0/0"

| Item | Detail |
| --- | --- |
| UI | `#cctv-sync-chip` defaults to `loading frames` / `0/0` |
| Writer | `_updateCctvSyncChip` in `src/ui/cctvPresentation.js` |
| State | CCTV `loading: { active: _geoLoading, loaded, total: _geoLoadTotal }` |
| Root cause | Busy path requires `total > 0`, but empty/failed/stuck geometry loads never force a terminal chip; HTML defaults advertise loading even before first update. No timeout. |
| Fix | Terminal for empty catalog / failed / timed-out load (NO DATA / NO COVERAGE / DEGRADED / READY); clear defaults; never leave chip spinning. |

## 3) Austin timezone shows UTC-7

| Item | Detail |
| --- | --- |
| UI | HUD summary local tag in `Hud._composeSummary` (`src/hud.js` ~631) |
| Root cause | `Math.round(lonDeg / 15)` → Austin ~−97.7 → **UTC-7**. Ignores IANA zones and DST (late Sep Austin is America/Chicago = CDT / UTC−5). |
| Fix | New `src/geoTimezone.js`: lat/lon → IANA zone (US boxes + coarse world), format via `Intl` short offset/name. No hard-coded fixed offsets in the HUD. |

## 4) Duplicated "CT CT"

| Item | Detail |
| --- | --- |
| Helper | `chicagoClock()` already appends ` CT` (`dataSourceRegistry.js`) |
| Call sites appending a second ` CT` | `analystPanel.js` (retrieved/observed), `trackWorkspace.js` (freshness), `cctvBrowser.js` (honesty line) |
| Fix | Remove the extra ` CT` at those call sites. |

## 5) Local ADS-B LIVE + BROKEN/UNAVAILABLE

| Item | Detail |
| --- | --- |
| Catalog | `DATA_SOURCES['local-adsb'].classification = 'LIVE'` |
| Runtime | `classifyLayer('local-adsb')` forces `BROKEN / UNAVAILABLE` whenever `count === 0` (even when layer OFF) |
| Track UI | `trackWorkspace.js` prints **static** `src.classification` (`LIVE`) beside runtime freshness |
| Sources UI | Shows runtime `cls.classification` (`BROKEN / UNAVAILABLE`) |
| Root cause | Catalog LIVE and runtime BROKEN shown together / track ignores runtime status. No-receiver idle treated as provider outage even when layer is off. |
| Fix | (a) Track uses runtime `st.status`. (b) `classifyLayer`: when layer off keep catalog class; when on with no receiver/error use single BROKEN/UNAVAILABLE; when streaming with zero heard keep LIVE. |

## 6) Dead RUN / SNAP / TOUR

| Control | Location | Finding |
| --- | --- | --- |
| RUN | `#atlas-command-run` | Wired via form submit → `run()`. Empty input is a **silent no-op** (feels dead). Hidden on compact until ASK opens (intentional). |
| SNAP | `data-atlas-action="snapshot"` | Wired → `snapshot()` (canvas PNG). Works when viewer ready; failures toast. |
| TOUR | `data-atlas-action="tour"` | Wired → `runTour()`. No toggle-to-stop on the button itself (stop is command/tour-stop only). |
| Fix | Empty RUN → honest status ("Type a command first"). SNAP/TOUR: guard missing viewer with disabled+title or toast; TOUR button toggles stop while running; keep visible only when they work. |

## Out of scope (do not touch this slice)

LIVE-2/3, Events, Photoreal billing, Cesium replacement, LOGIN_USER/LOGIN_PASS, architecture redesign.
