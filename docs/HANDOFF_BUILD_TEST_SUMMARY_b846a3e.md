# Known-good b846a3e build and test summary

This file is a scan aid. The complete transcript is [`HANDOFF_FULL_TEST_LOG_b846a3e.txt`](HANDOFF_FULL_TEST_LOG_b846a3e.txt). Do not treat this summary as a substitute for that log.

| Item | Value |
| --- | --- |
| Commit tested | `b846a3e0557bc879142aef69c2babd812757a9fc` |
| Node | `v24.21.0` |
| npm | `11.19.0` (recorded in the transcript) |
| Started | 2026-09-29 09:52:25 CDT |
| Finished | 2026-09-29 09:53:19 CDT |
| Working directory in the transcript | `/workspace/earth-eye-restore` |

Commands, in order:

```bash
npm ci
npm run build
npm test
```

`npm test` runs `node scripts/run-unit-tests.mjs` (`package.json` script `test`).

| Command | Exit |
| --- | --- |
| `npm ci` | 0 |
| `npm run build` | 0 (773 modules, built in 7.57s) |
| `npm test` | 1 |

Node test reporter in the transcript:

```text
ℹ tests 5523
ℹ pass 5457
ℹ fail 65
ℹ skipped 1
ℹ duration_ms 35918.049573
```

**Do not skip tests or weaken assertions to make this suite green. Keep all 65 failures visible.**

`window is not defined` occurrences in the log: 38.

The transcript also records that a later `npm test` of local atlas-eye tip `c6ef09d` was **not** run (`SKIPPED`). That tip is not the commit tested above.

## Failed tests (65)

- data setup seals the caller catalog before controls can restore and drains its exact instances
- catalogs construct distinct layers and classification from their supplied source
- excluded layers have no user-facing control: ALPR, simulated traffic and radio are hidden from the layer panel
- EE-LIVE-5: selected_entity shares exact Earth Eye identity
- selection card mounts hidden and shows FOLLOW/COCKPIT for air subject
- fire-camera packs are flagged non-commercial and not loaded
- OSM attribution introduces displayed data for five seconds, then stays discoverable in the overflow
- real earthquake lifecycle publishes host labels while runtime entities carry no label graphic
- quake disc axes are STATIC — a per-frame callback re-tessellates ground geometry
- earthquake refresh reports failure and clears it only after a successful response
- malformed earthquake refresh preserves entities, overlays, count and timestamp
- production registry is exact, canonical, and rejects incomplete contracts
- renders ordinary layer rows without recreating a panel-hidden coordinator
- keyboard focus survives Data Layer enabling and disabling transitions
- a failed Data Layer transition clears busy state without losing keyboard focus
- a layer that declares row controls renders its chips and color legend
- clicking a row chip applies the params it declared and re-renders
- a click outside a chip is inert, and a throwing layer cannot blank the panel
- keyboard focus on a chip survives the refresh its own click triggers
- an async layer pushes its own row refresh, and a busy chip refuses clicks
- a layer that surrenders its row controls hides the block entirely
- panel remount releases old listeners and destruction revokes retained controls
- row action chips use live disabled state and descriptive counts without writing parameters
- row notifications coalesce with animation frame and stop after destroy
- row notifications coalesce with timeout and stop after destroy
- row info and legends reconcile in place while chips retain focus and order
- clicking a selected installation again or empty map clears it through refresh
- clearing a stale installation highlight does not clear or reclaim another layer selection
- switching sites keeps the new selection through refresh and disable clears it
- real enabled installation entities carry no native label graphics
- Context focus past the render cap selects for real instead of flying blind
- a footprint-less relation just outside the viewport still renders
- a legacy-shaped payload at the cap fires the exact-viewport retry end to end
- a failed load buys the frame its status change needs
- off-viewport records from the snapped superset never render or enter context
- a saturated snapped tile refetches the exact viewport before rendering
- an unsaturated response never pays for a second upstream ask
- a still-saturated exact viewport is reported honestly instead of implied complete
- a floor that lands after the render deadline lifts the dots off the ellipsoid
- reports bounded installation requests as loading and clears on settlement
- zoom-out aborts an active installation request and returns non-loading guidance
- the retry is wired to every lifecycle edge, not just declared
- both layers gate the tracked-model load and record its failures
- a click on a storm card or lead-hour label selects that storm without picking
- advisory selection uses accessible row descriptors and shared camera handoff
- late refresh cannot publish after disable, re-enable, or destroy
- two displays own separate data sources and destruction
- an automatic fallback to Google 3D drops the swipe instead of re-leasing Esri; a manual switch re-leases once (subscription)
- an automatic fallback to Google 3D drops the swipe instead of re-leasing Esri; a manual switch re-leases once (stats poll)
- traffic recovers a failed destination request after another city has loaded
- universal notice lifecycle clears on dispose and uses the one top-center live region
- CelesTrak retains fresh and stale TLE caches
- reference factories retain compatibility without starting acquisition or sharing instances
- outbound User-Agents describe a private hosted instance, never "personal local instance"
- dev-only flag: a production build can never enable the excluded features
- registry refuses ALPR and simulated traffic; radio is COMMS-pending (not blanket excluded)
- shared enable gate: toggle, setEnabled and restore all refuse excluded layers, and the gate is not removable
- typed commands still omit radio (COMMS pending), traffic and ALPR
- data providers have both hooks; credential editing stays development-only
- provider-status reports set/unset only and never leaks key values
- explicit build inputs preserve browser-only defines, plugin order and loopback protections
- readout rows contain only toggles and metadata; ordinary rows retain controls
- the Recent Imagery readout mounts in its rail body like the weather readout and is rebuilt or released with the panel
- nearest-aircraft voice action serializes layer enable, arrival, refresh, airborne query, and selection
- nearest-aircraft voice action refreshes an already-enabled viewport layer after arrival

## Assertion file refs (from the transcript)

- `src/data/manager.test.mjs`: 30
- `src/data/militaryInstallations.test.mjs`: 16
- `src/layers/traffic/navigation.test.mjs`: 4
- `src/data/earthquakes.test.mjs`: 4
- `src/stage2Policy.test.mjs`: 4
- `src/app/constructCatalog.test.mjs`: 2
- `src/layers/cyclones/index.test.mjs`: 2
- `src/layers/earthquakes/ownership.test.mjs`: 2
- `src/layers/recentImagery/index.test.mjs`: 2
- `src/ui/layerPanel.test.mjs`: 2
- `src/voice/gevActions.test.mjs`: 2
- `src/data/detectionRenderDemand.test.mjs`: 1
- `src/app/catalog.test.mjs`: 1
- `src/atlas/analystTools.test.mjs`: 1
- `src/atlas/selectionCard.test.mjs`: 1
- `src/cctvPermissions.test.mjs`: 1
- `src/data/alprCameras.test.mjs`: 1
- `src/data/layerState.test.mjs`: 1
- `src/data/trackedModelRegime.test.mjs`: 1
- `src/loadingFeedback.test.mjs`: 1
- `src/proxyErrorResponses.test.mjs`: 1
- `src/sources/reference.test.mjs`: 1
- `src/stage2Attribution.test.mjs`: 1
- `src/tooling/previewServing.test.mjs`: 1
- `src/tooling/productionServer.test.mjs`: 1
