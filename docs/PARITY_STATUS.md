# Earth Eye parity status (live working copy)

Pinned baseline (do not edit): [`UPSTREAM_PARITY.md`](./UPSTREAM_PARITY.md) and
`/workspace/earth-eye-spec/parity/` (124-row matrix). This file records **status
changes only**, with working evidence. A row is done only when a test or live
check proves it — never because the UI exists.

Last updated: 2026-09-29 ~2:40 AM CT (COMMS-0 + Stage 4 packs deploy v20, America/Chicago).

## Status legend

Same vocabulary as the matrix: `verified`, `intentionally excluded`,
`permission-held`, `key-required`, `broken`, `missing`, `unverified`.


## COMMS-0 changes (2026-09-29 ~2:40 AM CT)

Controlling: `COMMS_DIRECTIVE_2026-09-29.md`. Owner **HELD** Broadcastify apply
(cost ~$2500/mo Catalog + competing-scanner declines). Do not email/apply.

| Matrix row | Old status | New status | Evidence |
| --- | --- | --- | --- |
| radio | intentionally excluded (enforced) | **NEEDS_CREDENTIAL / pending (per provider)** | No longer blanket INTENTIONALLY_EXCLUDED. Registry review `pending`; `excluded=false`; layer still off. `docs/COMMS0_AUDIT.md`, `docs/SOURCE_REGISTRY_COMMS.md`, `src/comms/providers.js`. |
| Radio / scanners | intentionally excluded (enforced) | **per-provider** | Broadcastify `NEEDS_CREDENTIAL` + license-review **HELD**; OpenMHz `PERMISSION_REQUIRED`; RadioReference `LICENSE_REQUIRED`; LiveATC `BLOCKED_BY_PROVIDER_TERMS` (audio blocked); local SDR hardware extension only. |
| control_radio | excluded | **held (reuse)** | Schema retained; not scheduled until a credentialed COMMS provider exists. |
| Broadcastify | _(new)_ | **NEEDS_CREDENTIAL / license-review HELD** | Stub `/api/comms/broadcastify` → 403 empty feeds. No scrape. No fake catalog. No apply. |
| LiveATC audio | excluded | **BLOCKED_BY_PROVIDER_TERMS** | Unchanged hard block. |

ALPR / simulated traffic / fiction / unauthorized cams / encrypted bypass unchanged.

## Stage 2 changes

| Matrix row                           | Old status                            | New status                                  | Evidence                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| alpr-cameras                         | intentionally excluded (NOT ENFORCED) | **intentionally excluded (enforced)**       | Production build: no layer-panel control; `setEnabled`/`toggle` refuse; share `l=e.t.p.r` leaves it off; typed `show alpr` → Not understood. Unit: `src/stage2Policy.test.mjs`. Browser: `scripts/qa-exclusions.mjs` (Chromium + WebKit). Dev-only behind `VITE_EE_DEV_EXCLUDED=1` (never in `PROD`). |
| traffic (simulated)                  | intentionally excluded (NOT ENFORCED) | **intentionally excluded (enforced)**       | Same gate as ALPR; Director recipes drop `city-overload` / `omniscience-pullback`; stored/imported projects strip them. `qa-exclusions` + `stage2Policy` tests.                                                                                                                                       |
| Simulated traffic particles          | intentionally excluded (NOT ENFORCED) | **intentionally excluded (enforced)**       | Same as traffic row.                                                                                                                                                                                                                                                                                  |
| ALPR camera map                      | intentionally excluded (NOT ENFORCED) | **intentionally excluded (enforced)**       | Same as alpr-cameras.                                                                                                                                                                                                                                                                                 |
| radio                                | intentionally excluded (WIP-only)     | **intentionally excluded (enforced)**       | `/api/radio*` → 403 `excluded-by-policy`; panel hidden; enable gate; command vocabulary. `productionServer.test.mjs`, `qa-exclusions`.                                                                                                                                                                |
| Radio / scanners                     | intentionally excluded                | **intentionally excluded (enforced)**       | Same.                                                                                                                                                                                                                                                                                                 |
| Launch reconstructed replay          | intentionally excluded (NOT ENFORCED) | **intentionally excluded (enforced)**       | Production: no REPLAY ASCENT button, no `_replayTracks`, no trajectory/vehicle/transfer entities. Unit: `rocketLaunches.test.mjs` production case. Browser: `qa-exclusions`. Behind `devExcludedFeaturesEnabled()`.                                                                                   |
| TR-3B fictional aircraft             | intentionally excluded (NOT ENFORCED) | **intentionally excluded (enforced)**       | `#tr3b-toggle` removed; `toggleTr3b` no-op unless dev flag. `qa-exclusions`.                                                                                                                                                                                                                          |
| Shinjuku "Pilot Feed Pack"           | intentionally excluded                | **intentionally excluded (removed)**        | `config/cctv_sources.shinjuku.json` deleted; `/config/…` → 404.                                                                                                                                                                                                                                       |
| military (colour)                    | verified (amber, provenance gap)      | **verified (green from source)**            | Colour from `dbFlags` / feed listing (`readsbMilitaryProvenance`); green `#4ADE80`, not amber. Unit: `stage2Attribution.test.mjs`.                                                                                                                                                                    |
| bhote-koshi-locator                  | unverified (mislabelled allowed)      | **verified (CC BY-NC 4.0)**                 | Registry `license=CC BY-NC 4.0`, `commercialUse=non-commercial`, `reviewedAt=2026-09-28`. Unit + Licenses panel.                                                                                                                                                                                      |
| telegeography-submarine-cables       | verified (NC note)                    | **verified (NC flagged + commercial-safe)** | `CC BY-NC-SA 3.0`, `commercialRestricted`; commercial-safe mode disables it.                                                                                                                                                                                                                          |
| bhote-koshi-2026                     | unverified                            | **verified (NC flagged)**                   | `CC BY-NC 4.0`, commercial-restricted; historical pack.                                                                                                                                                                                                                                               |
| CCTV Ontario 511                     | broken                                | **key-required**                            | Never `approved`; pack health `key required`; env switch cannot enable. `cctvPermissions.test.mjs`, Data Sources camera section.                                                                                                                                                                      |
| CCTV Maryland CHART                  | permission-held                       | **permission-held (enforced)**              | `review=held`; env switch cannot enable.                                                                                                                                                                                                                                                              |
| CCTV held packs (DelDOT et al.)      | permission-held                       | **permission-held (DelDOT enforced)**       | DelDOT `held`; env switch cannot enable. Maryland same.                                                                                                                                                                                                                                               |
| Data source registry + panel         | verified (gaps)                       | **verified (review dates + health)**        | Every source has `reviewedAt=2026-09-28`, licence, attribution. Data Sources shows health (online/degraded/offline/key required/rate limited/stale) + last success/attempt + provider. Break-tests: `sourceHealth.test.mjs`, `qa-exclusions` health/stale.                                            |
| Central enable gate                  | verified (monkeypatch)                | **verified (construction-time policy)**     | Non-removable `enablePolicy` on `LayerLifecycle`; every enable path consults it. `stage2Policy.test.mjs`.                                                                                                                                                                                             |
| Fly.io deploy (User-Agent)           | verified (inaccurate UA)              | **verified (UA fixed)**                     | Outbound UA: `private hosted instance; +https://eartheye.us`. `stage2Attribution.test.mjs`.                                                                                                                                                                                                           |
| set_layer_visibility / control_scene | verified (ALPR/traffic not blocked)   | **verified (excluded blocked)**             | Command parser + enable gate; traffic scenes gone.                                                                                                                                                                                                                                                    |
| View share links                     | verified                              | **verified (excluded refused)**             | `l=e.t.p.r` restores earthquakes only.                                                                                                                                                                                                                                                                |
| Director scenes                      | verified (2 enable sim traffic)       | **verified (traffic scenes removed)**       | Recipes filtered; normalizeProject drops them.                                                                                                                                                                                                                                                        |
| Attribution / Licenses panel         | _(new)_                               | **verified**                                | MORE → LICENSES; 9 CC BY model credits + every registry source. `stage2Attribution.test.mjs`, `qa-exclusions` licenses.                                                                                                                                                                               |
| Commercial-safe mode                 | _(new)_                               | **verified (off by default)**               | `EE_COMMERCIAL_SAFE=1` disables every `commercialRestricted` dataset + NC CCTV packs + OpenSky/Open-Meteo/Google News RSS. Unit + server tests. Stays OFF for personal use.                                                                                                                           |
| CCTV ALERTCalifornia + HPWREN        | missing                               | **missing (flagged NC, not implemented)**   | Registry/permissions records exist (`not-implemented`, non-commercial); loaders deferred to Stage 3/4.                                                                                                                                                                                                |

## Unchanged (Stage 2 did not claim)

Satellites GP/OMM rewrite, new camera packs (Iowa/HK/…), camera height source swap,
routing straight-line ban, weather alerts — Stage 3+. `docs/UPSTREAM_PARITY.md`
is untouched.

| Data Sources panel jank (perf) | _(new / Stage 1 residual)_ | **mitigated (emulation)** | In-place health patch; no 5 s full rebuild. Journey script. Real iPhone still pending owner checklist. |
| Orphan CCTV media after leave | _(new)_ | **mitigated (emulation)** | closeViewer on leave Cameras. Journey script. |

| Continuous collection (server) | _(new)_ | **wake-time only (not 24/7)** | `server/collection/*` + `/api/atlas/collection-health`. Fly auto-stop unchanged; spend options reported in STAGE2_REPORT. |

## Stage 3 changes (in progress on `stage3-analyst-routing`)

| Matrix row | Old status | New status | Evidence |
| --- | --- | --- | --- |
| Routing straight-line fallback | unverified / draws direct line on OSRM fail | **fixed (no stand-in)** | Annotation `annotate({type:route})` throws `route unavailable`; unit `annotationEngine.test.mjs`. Directions layer already refused stand-ins. |
| Typed console schema coverage | ~20/30 | **expanded (~29/30; radio excluded)** | Phrases for layers menu, panels, context, entity/view, cyber sonar, map stack, CCTV controls, frame overhead, fly route, next satellite pass. `commandParser.test.mjs`. |
| select_nearest / track completion | unverified / headless timeout | **fixed (no camera-settle wait)** | `waitForArrival: false` + `complete: true` on select_nearest. `selectNearestCompletion.test.mjs`. |
| Continuous collection | wake-time only | **always-on durable (Option C KEEP)** | Volume `vol_458pq531kp61x784`, snapshots 5-day; see `OPTION_C_FLY.md`. |

## Spend — Option C KEEP (2026-09-29 CT)

Always-on + 1 GB `eartheye_data` + daily snapshots (5-day retention). See
`docs/OPTION_C_FLY.md`. No further Fly spend changes without new approval.

Stage 2 still incomplete vs product standard: owner credential config UI,
credential testing, physical iPhone lag. Persistent collection: on volume when
machine healthy (`continuousClaim` only if durable ready).


## Layer + tool accounting (FINAL_BUILD_DIRECTIVE)

Canonical **28** share/registry layers (`LAYER_STATE_REGISTRY`) **plus** `local-adsb` (LAN/local receiver, not a share token):

| ID | Status (working copy) | Notes |
| --- | --- | --- |
| ais-live-vessels | key-required | AISStream free key |
| alpr-cameras | intentionally excluded (enforced) | Stage 2 |
| bhote-koshi-2026 | verified (NC) | Historical pack |
| bhote-koshi-locator | verified (CC BY-NC) | |
| bikeshare | unverified | Stage 4 QA |
| cctv | verified (packs gated) | Seattle/Iowa/Iceland pending env |
| directions | verified (no straight-line) | Stage 3 |
| earthquakes | verified + selection contract | USGS; tap → context/detail |
| fire-perimeters | verified + selection contract | NIFC; tap → detail request |
| flights | verified | |
| local-dams | verified | OSM extract |
| local-datacenters | verified | |
| local-firms | verified + selection contract | FIRMS; tap → context/detail |
| military | verified (green provenance) | Stage 2 |
| military-awareness | verified | |
| military-installations | verified (timeout 15s) | OSM Overpass |
| radio | **COMMS pending / NEEDS_CREDENTIAL per provider** (not blanket excluded) | COMMS-0; LiveATC blocked; Broadcastify HELD |
| recent-imagery | unverified | Stage 4 |
| rocket-launches | verified (no replay in prod) | |
| satellites | in progress (GP/OMM) | Stage 4 |
| telegeography-submarine-cables | verified (NC) | |
| traffic | intentionally excluded (enforced) | |
| transit | unverified | Stage 4 |
| weather-cyclones | verified + selection contract | Polo P0 |
| weather-lightning | verified (observed) | |
| weather-radar | verified (observed; no invent pixels) | |
| weather-satellite | verified (observed) | |
| wind | verified (forecast) | |
| local-adsb | verified | +1 beyond the 28 |

### 30 GEV action tools (control_radio held — COMMS pending credentials)

Typed console covers **29/30** (`control_radio` excluded). Evidence: `commandParser.test.mjs`, live journey 10/0.

| Tool | Typed/Analyst | Notes |
| --- | --- | --- |
| fly_to_location | yes | |
| select_nearest_aircraft | yes | no camera-settle wait |
| adjust_camera_zoom | yes | |
| zoom_to_globe | yes | |
| set_layer_visibility | yes | explicit + show/hide |
| show_data_layers_menu | yes | |
| set_panel_open | yes | |
| set_context_mode | yes | |
| control_cockpit | yes | |
| set_visual_style | yes | |
| get_entity_context | yes | explain this |
| get_current_view_state | yes | |
| set_hud | yes | |
| set_cyber_sonar | yes | |
| set_detection | yes | |
| set_map_stack | yes | |
| set_post_processing | yes | |
| control_scene | yes | |
| control_cctv | yes | |
| control_radio | **held (COMMS pending)** | reuse schema; no schedule until credentialed provider |
| track_entity | yes | |
| stop_tracking | yes | |
| frame_overhead | yes | |
| annotate_map | yes | Analyst wraps annotations[] |
| clear_annotations | yes | |
| move_camera | yes | |
| fly_route | yes | |
| analyst_query | yes | |
| next_iss_pass | yes | |
| next_satellite_pass | yes | |

### Stage 4 authenticity (2026-09-29)
- Weather alerts (NWS): **partial→live** — `/api/nws-alerts` + `weather-alerts` layer (token 0); CAP fields + honest null geometry.
- CCTV Québec 511: **pending gate** (`CCTV_QUEBEC_ENABLED`) — CC BY 4.0 research APPROVED; VIDEO CLIP.
- CCTV ground heights: **google-3d-tiles refused** at serve; runtime Re:Earth; rederive script + sample `reearth-terrain` sidecar.

### Stage 4 packs / OMM / Overpass (2026-09-29)
- CCTV: lakecounty, singapore (pending gates); alertcalifornia + hpwren (NC, commercial-safe off).
- Satellites: CelesTrak GP FORMAT=json OMM validation fixed (no longer requires TLE `1 ` lines on primary path).
- Overpass: maps.mail.ru mirror removed. Transit/bikeshare unit QA 38/38.
