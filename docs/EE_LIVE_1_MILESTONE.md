# EE-LIVE-1 — Loaders / timezone / ADS-B / controls

**Shipped:** 2026-09-29 ~5:33 AM CDT (America/Chicago)  
**Directive:** Live World / Audit Remediation Phase 1 only  
**Master:** FINAL ENGINEERING BUILD DIRECTIVE (authenticity first; no fabricated observations)  
**Findings:** [`EE_LIVE_1_FINDINGS.md`](./EE_LIVE_1_FINDINGS.md)  
**Rollback tip:** Fly **v44** `registry.fly.io/eartheye:deployment-01M3P9HQVJXPVTM52MJJCR40GE` (`docs/EE_LIVE_0_ROLLBACK.md`)

## Production

| Item | Value |
| --- | --- |
| App | `eartheye` |
| Fly release | **v45** (complete) |
| Image | `registry.fly.io/eartheye:deployment-01M3PBHNM92GYJQKGC33DZBCH2` |
| Machine | `28654321fd7928` (dfw), checks **1/1 passing** |
| Health | `GET https://eartheye.us/healthz` → `{"ok":true}` |
| Auth gate | unauthenticated `/` → **401**; `/login` → **200** Sign in · Earth Eye |
| Photoreal / billing | untouched |
| LOGIN_USER / LOGIN_PASS | untouched |

## Defects fixed

1. **SYNCING ROAD NETWORK** — `reduceTrafficSyncFeedback` caps busy at 45s and settles to a truthful terminal (`trafficSyncTerminalLabel`: READY / DEGRADED / NEEDS KEY / NO COVERAGE / OFFLINE / NO DATA). Chip HTML defaults cleared so a non-visible chip cannot advertise syncing.
2. **LOADING FRAMES 0/0** — `_updateCctvSyncChip` forces terminal (NO DATA / DEGRADED / camera grid ready) for empty catalog, timeout, or completion; HTML defaults cleared.
3. **Austin timezone** — HUD summary uses `localTimezoneTag` / `ianaTimezoneAt` (`src/geoTimezone.js`). Austin → `America/Chicago` (CDT in late Sep), never longitude/15 → UTC−7.
4. **CT CT** — removed duplicate ` CT` after `chicagoClock()` in analystPanel, trackWorkspace, cctvBrowser.
5. **Local ADS-B LIVE vs BROKEN** — `classifyLayer('local-adsb')` single coherent status (off → catalog LIVE; enabled idle → BROKEN/UNAVAILABLE; streaming → LIVE). Track workspace shows **runtime** `st.status`, not static catalog LIVE beside BROKEN.
6. **Dead RUN / SNAP / TOUR** — empty RUN says why; SNAP/TOUR guard missing globe; TOUR toggles STOP while running.

Also aligned Street Traffic registry/classify with authenticity: keyless → **KEY REQUIRED** (no simulated cars), not invalid `NEEDS KEY` enum / SIMULATED catalog class.

## Tests

82 unit tests green across: `geoTimezone`, `loadingFeedback`, `dataSourceRegistry`, `sourceHealth`, `traffic`.

## Remaining risks

- Busy-cap is 45s — a legitimately slow TomTom/OFM first paint may flash DEGRADED/NEEDS KEY then recover on next idle sample.
- Coarse IANA boxes outside the US may mis-tag uncommon regions (Etc/GMT fallback); continental US / Austin is correct.
- Authenticated UI smoke (post-login chips/controls) not driven in this slice; healthz + login page verified.
- LIVE-2+ (nav IA, capability model, LIVE EARTH preset, etc.) **not started**.

## Rollback

If v45 misbehaves:

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false --image registry.fly.io/eartheye:deployment-01M3P9HQVJXPVTM52MJJCR40GE
```

That restores **v44** tip recorded in EE-LIVE-0.

## Stop

EE-LIVE-1 only. Do not auto-start LIVE-2.
