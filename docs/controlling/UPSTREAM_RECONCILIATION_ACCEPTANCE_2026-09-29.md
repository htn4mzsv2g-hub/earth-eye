# EARTH EYE — UPSTREAM RECONCILIATION + ACCEPTANCE DIRECTIVE

**Ruben — 2026-09-29, approximately 5:51 AM CT**  
**Documentation directive only. No code, deployment, billing, key creation, or provider activation is authorized by this document.**

This directive reconciles the pinned upstream reference with the existing Earth Eye product and establishes the acceptance bar for the next slices. It is read after the Final Engineering master and Live World remediation, and before the Cockpit and Photoreal/COMMS Path A specifications in the controlling stack.

## 1. Product standard and authority

Earth Eye is a trustworthy Earth intelligence and observation product. It is not a game, fictional surveillance console, simulated world, cinematic demo, or substitute for an authorized source.

The product workflow is:

> **SELECT → UNDERSTAND → INSPECT EVIDENCE → SEE RELATED CONDITIONS → FOLLOW UPDATES**

The product must be impressive through reliability, source clarity, connected information, responsiveness, and depth—not through fabricated motion, synthetic incidents, false freshness, or implied omniscience.

Authority, in order:

1. The Final Engineering master controls authenticity, permissions, security, shared state, source truth, layers, Analyst, production posture, and evidence.
2. Live World remediation controls the empty-console repair, truthful startup, loaders, navigation, capability disclosure, camera relevance, Analyst completion, event extension, and release sequence.
3. This directive controls upstream reconciliation and acceptance accounting.
4. The Cockpit directive controls first-person aircraft presentation.
5. Photoreal/COMMS Path A controls owner-gated Photoreal setup and the newer lawful communications decision.

A lower document cannot authorize fabricated observations, bypass source terms, expose secrets, add paid infrastructure, or turn an unverified adapter into a working feature.

## 2. Pin the baselines before any delta work

The baseline is a recorded fact, not a moving branch name.

| Baseline | Pinned reference | Required handling |
|---|---|---|
| Upstream parity reference | `bilawalsidhu/gods-eye-view` at `81eb44340d90feda5b5283438f6e5fdad5cabbdd` (`81eb443`) | Treat as the parity comparison point. Reconfirm the actual repository before claiming parity. |
| Upstream main at last audit | `81eb443` | The 2026-09-28 audit recorded `origin/main == 81eb443` and no commits after the pin. This must be rechecked at the start of later stages. |
| Earth Eye working branch at last audit | `stage1-mobile-registry` at `837e907` plus uncommitted WIP | Do not treat WIP as released or complete. Preserve a rollback point and record the exact state before implementation. |
| Earth Eye main at last audit | `1e5aeae` | Use only as a historical comparison until the actual checked-out repository is inspected. |
| Live remediation sequence | `EE-LIVE-0` through `EE-LIVE-5`; **EE-LIVE-3 is in flight** | Continue the LIVE slice first. Do not silently start a competing redesign. |

Before any implementation or acceptance claim, record:

- repository, branch, commit, dirty/uncommitted state, and upstream remote state;
- the exact upstream comparison commit and date checked;
- build/test commands and their result;
- source registry/policy state and migration state;
- release and rollback references where a release exists;
- what is verified, unverified, key-required, permission-held, blocked, excluded, or awaiting a physical device.

A screenshot, listed file, adapter, endpoint `200`, catalog count, or passing unit test is not parity or acceptance by itself.

## 3. Reconciliation method

Reconcile by evidence and targeted change, not by wholesale merge.

1. Fetch or otherwise inspect the upstream history and record `81eb443..origin/main` at the beginning of Stages 2 and 4.
2. Compare the actual Earth Eye tree to the pinned tree. Do not infer absence from a UI omission or presence from a file name.
3. Classify each item as **verified**, **partially verified**, **unverified**, **broken**, **missing**, **key-required**, **permission-held**, **awaiting real-device test**, or **intentionally excluded**.
4. Review the source, license, permission, key, data-retention, and commercial-use implications independently of code similarity.
5. Port only an approved, relevant delta. Prefer individual files or small commits; never wholesale-merge a moving upstream branch into Earth Eye.
6. Add or update tests, source evidence, failure states, attribution, and rollback notes with the delta.
7. Re-run the affected journey on desktop and, where applicable, physical iPhone. Report emulation separately from real-device evidence.
8. If a delta conflicts with Earth Eye authenticity, privacy, permission, cost, or product rules, keep Earth Eye’s rule and document the upstream item as excluded or held.

The current upstream after-pin record identifies relevant unmerged work including the Overpass offload and cyclone-advisory-time fix. Those are candidates for review, not authorization to merge. The traffic and ALPR portions of the Overpass branch remain excluded by policy; installations, outlines, terrain retry, and below-ground arrival fixes require their own review.

## 4. Delta matrix

This matrix is the acceptance index. The status column is a gate, not a claim that the work is done.

| Surface | Pinned/upstream baseline | Earth Eye reconciliation | Acceptance / next action |
|---|---|---|---|
| Core parity | Upstream `81eb443`; 29 registered upstream layer entries and 30 action schemas are audit inputs | Earth Eye keeps the existing application and adds auth, registry, policy, mobile, Analyst, and honesty work | Maintain a feature matrix with source, permission, config, evidence, and status for every item |
| Canonical layers | 28 product layer families for acceptance accounting | Group provider implementations into the 28 product layers; excluded ALPR and synthetic traffic do not become usable layers | Every layer has source, delivery type, time, coverage, permission, legend/units, and failure state |
| Action surface | 30 upstream action schemas | Preserve the 30-action accounting; typed commands, UI, Analyst, and any future voice use one validated action service | Verify argument validation, bounded execution, cancellation, structured errors, source/time/scope evidence, and truthful unavailable states |
| Mobile shell | Desktop/upstream controls plus Earth Eye mobile shell | Canonical `GLOBE / TRACK / CAMERAS / ANALYST / MORE`; one selection contract | Physical-iPhone gate remains incomplete until owner-device evidence exists |
| Authentication | Not an upstream product concern | Closed/private beta, server-side authorization, secure session and owner checks | Test authorized, unauthorized, expired-session, logout, and recovery paths without exposing secrets |
| Source registry | Upstream data-source documentation and adapters | Shared registry with identity, official docs, coverage, permissions by operation, attribution, review date, limits, health, kill switch, and failure behavior | No displayed production record without provenance and meaningful timing |
| COMMS | Older Earth Eye baseline excluded radio/scanner | Newer COMMS decision overrides the blanket exclusion; provider-neutral lawful communications work may proceed | Broadcastify is integration candidate/credential-gated; OpenMHz permission-required; RadioReference license-required; LiveATC blocked by provider terms; local SDR requires owner hardware. No restricted/encrypted/private interception |
| Roads and traffic | Upstream road/traffic adapters and simulation paths | Roads are geometry/context; traffic is measured or provider-estimated; closures/construction are distinct states | Investigate stuck roads before declaring coverage or replacing the source. Synthetic cars remain disabled in the real-data default |
| Cameras/media | Upstream catalog/viewer and media labels | Permission-reviewed catalog synchronized with map/list and selected camera ID | Prove identity, location, media type, source time, playability, retry, fullscreen, autoplay fallback, close cleanup, and honest LIVE/CLIP/STILL labels |
| Aircraft | Upstream flight layers, contacts, tracking, and cockpit | Source-owned track, explicit delay/coverage, bounded interpolation, stale handling, shared selection, synthetic cockpit | Prove select/follow/cockpit/switch journeys; never imply onboard video or infer a mission, crash, or landing |
| Satellites | TLE/SGP4 and pass actions in upstream audit | Prefer authorized GP/OMM elements, epoch/age, maintained propagation, cache/mirror with visible age | Pass prediction is not accepted until valid elements and a tested failure path exist |
| Weather | Distinct upstream weather sources and time models | Interactive weather uses actual frames/observations/forecasts with legends, units, timestamps, and coverage | Radar, clouds, wind, forecast, warnings, lightning, and hazards remain distinct; no synthetic weather when source data is absent |
| Analyst | Upstream action schemas plus Earth Eye Analyst tools | Analyst and map operate on the same selection, viewport, filters, layers, time scope, and live/replay mode | Evidence opens the exact same entity; query and display actions remain separate; “no reports” is not “nothing happened” |
| Photoreal | Google Photorealistic 3D Tiles via authorized path | Keyless honest capability with fallback chain | `Google direct → ion Google 3D → Esri → OSM`; no billing/key creation; Retina/Hybrid waits for owner key verification on iPhone |
| LIVE EARTH | Live World remediation amendment | Lightweight progressive current-view preset using a small high-signal source set | Show source-grounded status and counts; never create a busy globe from synthetic data; terminal states are visible |
| World Events | No assumption of a universal event feed | EE extension with normalized event contract, tiered sources, context, evidence, and follow mechanism | Related data is not causal proof; no fake 24/7 follow or notifications without a real mechanism |
| Scenes | Upstream Director scenes and share/import surfaces | Separate live-safe compositions from historical, illustrative, reconstructed, or synthetic scenes | Excluded layers cannot enter production via scenes, imports, share tokens, or actions |
| Production | Existing Option C posture | Preserve current budget, private beta, rollback points, and provider cost controls | No infrastructure increase, paid API, purchase, deployment, or billing change in this directive |

## 5. Stuck roads investigation and traffic rules

A road surface that remains stuck in `SYNCING`, `LOADING`, or an apparently empty state is a defect to investigate, not permission to substitute fake activity.

### Investigation checklist

Record a reproducible viewport, zoom, time, device, network, active layer state, source, request ID, response age, and terminal state. Check, in order:

1. layer policy and whether the road source is actually enabled;
2. viewport/bounds and zoom admission, including antimeridian and projection handling;
3. provider URL, tile/template expansion, authentication, CORS, attribution, and terms;
4. request timeout, cancellation, retry/backoff, response size, parsing, and tile-cache behavior;
5. whether a provider failure was incorrectly converted to an empty successful result;
6. whether late or stale responses are overwriting newer state;
7. renderer visibility, style/filter rules, terrain ordering, and camera-distance thresholds;
8. source coverage and whether the requested region legitimately has no data;
9. recovery after moving, zooming, disabling/re-enabling, network loss, and session expiry.

A loader must end as `READY`, `DEGRADED`, `NO DATA`, `NEEDS KEY`, `NO COVERAGE`, `OFFLINE`, `STALE`, `PERMISSION HELD`, or `UNAVAILABLE`, with an actionable explanation. It must never spin indefinitely.

### Traffic and road truth rules

- Road geometry is not traffic. A basemap or OSM road line does not mean a road is open, clear, safe, or currently occupied.
- Traffic must come from an authorized measured or provider-estimated flow/incidents source, with observation/update time, coverage, units, and confidence/quality where supplied.
- Closures, construction, restrictions, planned works, and recent reports are separate categories and states. Do not collapse planned into active or active into clear.
- `NO DATA`, provider failure, stale data, and no reported incident are distinct. None is an all-clear.
- No simulated cars, particle traffic, invented speeds, invented congestion, or inferred closure may appear in the real-data default, scenes, share links, Analyst answers, or fallback paths.
- TomTom traffic remains `NEEDS KEY`/permission-reviewed until an authorized key and terms are verified. OpenFreeMap or another road source may supply geometry only after terms and attribution are reviewed.
- Traffic actions must select the same road/incident object as the map and detail view, and must cite source, scope, and observation/update time.

## 6. Selection, details, and shared state

The selection contract is the backbone of reconciliation. It is not complete when only the marker highlights.

Shared state includes:

- selected place, event, aircraft, vessel, satellite, road incident, camera, or other stable provider-qualified entity;
- viewport, bounds, radius/polygon/drawn region, camera pose, and current navigation owner;
- active layers, filters, category, quality, source, and permission state;
- time scope and live/replay/forecast/historical mode;
- Analyst conversation location and prior selection context;
- detail-panel, list, map, viewer, follow/chase, and scene state.

Required invariants:

- A search result, list row, marker, Analyst result, detail card, and follow action resolve to the same stable provider-qualified ID.
- Selecting from Analyst opens the exact object, camera, layer, or place represented by the evidence.
- “Query data” is read-only. “Show on map”, “enable layer”, “open viewer”, “select”, and “follow” are explicit actions and are only confirmed after success.
- Changing selection cancels obsolete requests, prevents late responses from replacing newer state, and preserves useful panel context without showing stale content as current.
- Every detail view states source/provider, object ID where useful, geographic scope/precision, observation/event/publication/retrieval time, freshness, coverage, delivery type, permissions, uncertainty, and gaps.
- Place details distinguish sourced facts, historical imagery/3D context, forecast/model output, and current observation. Never invent occupants, interiors, access, precision, or current conditions.
- An empty detail result, missing report, unavailable provider, and no coverage are different states.

## 7. Interactive weather and hazards

Weather is an interactive evidence surface, not decorative motion.

The user must be able to select a weather layer or frame, inspect the legend and units, move through available frames where retention/terms allow, and understand whether the display is an observation, analysis, forecast, model, warning, or historical image.

Acceptance requirements:

- Radar reflectivity/velocity, forecast precipitation, satellite clouds, wind observations/fields, wind forecasts, lightning, warnings, and hazard detections remain distinct.
- Each frame exposes actual source/frame time, retrieval time where useful, geographic coverage, update cadence, animation/playback state, legend, units, and stale/unavailable state.
- Interactive scrub/play/pause must not rewrite the observation time or imply fresh data merely because the UI animated.
- NWS/CAP warnings, USGS earthquakes, FIRMS detections, NIFC/WFIGS perimeters, GDACS/Copernicus and other registered sources retain their own provenance and semantics.
- Thermal fire detections are not confirmed fire perimeters; modeled flood extent is not observed inundation; warning is not measured impact; an earthquake point is not measured damage.
- Missing or failed weather data renders a truthful empty/error state, not a procedural animation or synthetic cloud/rain layer.
- Weather context opened from an Analyst answer or event detail uses the same map time scope and selection, and the return path preserves the prior state.

## 8. Analyst: 30 actions, same state, real evidence

The upstream parity surface is **30 action schemas**. Earth Eye must account for all 30 in the matrix, even when an action is unavailable because a source, key, permission, or device is absent. A schema or parser entry alone is not validation.

The action inventory is:

1. `fly_to_location`
2. `select_nearest_aircraft`
3. `adjust_camera_zoom`
4. `zoom_to_globe`
5. `set_layer_visibility`
6. `show_data_layers_menu`
7. `set_panel_open`
8. `set_context_mode`
9. `control_cockpit`
10. `set_visual_style`
11. `get_entity_context`
12. `get_current_view_state`
13. `set_hud`
14. `set_cyber_sonar`
15. `set_detection`
16. `set_map_stack`
17. `set_post_processing`
18. `control_scene`
19. `control_cctv`
20. `control_radio` (COMMS-gated, not blanket-excluded)
21. `track_entity`
22. `stop_tracking`
23. `frame_overhead`
24. `annotate_map`
25. `clear_annotations`
26. `move_camera`
27. `fly_route`
28. `analyst_query`
29. `next_iss_pass`
30. `next_satellite_pass`

Action acceptance:

- One validated schema and action service backs the UI, typed commands, Analyst, and any future voice surface.
- Arguments are validated, authorized, bounded, cancellable, timeout-safe, and return structured errors.
- Map mutations are explicit. The answer must never claim an action succeeded before the shared state confirms it.
- Query results include direct summary, geographic scope, “as of” time, source/evidence links, uncertainty, coverage gaps, truncation, and permitted follow-up actions.
- An Analyst query does not require a display layer to be ON unless the query itself needs that source; “show on map” remains a separate action.
- If AI synthesis is unavailable, deterministic queries and map actions still work and the UI says that AI summaries are unavailable. No canned conversation, training-memory live answer, or invented synthesis.
- Radio is now governed by the COMMS override: it may be developed only through lawful, permission-reviewed providers and owner hardware. It does not authorize encrypted, restricted, private, hacked, or unauthorized interception, and its unavailable/held state must be honest.

## 9. The 28-layer acceptance surface

For acceptance, Earth Eye reports **28 canonical product layer families**. Provider adapters, optional inputs, and historical locator data may support a family but do not inflate the product count. ALPR is excluded; synthetic traffic is excluded from the real-data default. Local ADS-B is an optional owner-device/provider input, not a license to claim universal coverage.

1. Basemap and terrain
2. Imagery and recent-imagery comparison
3. Places and search context
4. Weather radar
5. Weather satellite/cloud imagery
6. Wind fields and forecasts
7. Lightning display
8. Cyclones/storm tracks
9. Weather warnings
10. Earthquakes
11. Fire detections and perimeters
12. Floods, rivers, and flood models
13. Roads and traffic flow
14. Closures and construction/restrictions
15. Public cameras and media
16. Civil aircraft
17. Source-identified military aircraft
18. Optional local ADS-B receiver
19. Authorized vessels/AIS
20. Satellites and orbital predictions
21. Launches and events
22. Transit
23. Bikeshare where permission-cleared
24. Military installations and geographic context
25. Military awareness/proximity context
26. Datacenters/infrastructure snapshots
27. Dams/infrastructure snapshots
28. Submarine cables and related infrastructure

Every layer must show or expose source identity, delivery type, observation/event/frame time, coverage, freshness, permission state, legend/units where applicable, and failure behavior. Catalog count, usable count, fresh count, visible count, and playable count remain separate. Static infrastructure and historical imagery retain capture/snapshot dates. An adapter or control is not completion.

## 10. Photoreal chain and capability truth

The accepted fallback chain is:

> **Google direct → ion Google 3D → Esri → OSM**

Photorealistic 3D remains `NEEDS KEY` until the owner intentionally supplies and verifies an appropriately restricted key. This directive does not create billing, keys, spend, or infrastructure. Required behavior:

- report capability and provider health without exposing secret names or values;
- preserve Google, ion, Esri, OSM, and Cesium attribution and terms;
- never cache, extract, scan, derive, or mislabel Photoreal data;
- fall back deterministically when a provider is absent, denied, rate-limited, or stale;
- never call Esri/OSM Photoreal, current imagery, or current event evidence;
- hold Retina/Hybrid polish until the owner verifies the key and the path on the target iPhone;
- test cold start, keyless start, provider failure, fallback transition, camera/selection continuity, and recovery.

## 11. LIVE EARTH startup

LIVE EARTH is a lightweight progressive preset for the current view, not a fake busy globe.

It may activate a small, high-signal, low-cost set of authorized sources appropriate to the current viewport. It must:

- begin with a truthful compact state such as `LIVE EARTH / N SOURCES ACTIVE`;
- load progressively and independently, so one slow provider does not block the globe;
- show source health and terminal states per source;
- preserve observation/source times rather than treating retrieval as observation;
- avoid synthetic traffic, invented tracks, demo disasters, fictional cameras, or decorative “activity”;
- support empty, degraded, offline, no-coverage, key-required, and permission-held windows;
- leave the same layers, selection, viewport, and time scope available to Analyst and detail surfaces.

**EE-LIVE-3 is in flight.** Upstream and Cockpit deltas follow the LIVE slice unless they are proven blockers to the current slice. Do not use this directive to interrupt the active remediation sequence.

## 12. World Events — Earth Eye extension

World Events extends the existing product; it does not replace source-specific layers or create a universal incident truth.

The normalized event contract includes:

- stable provider-qualified event ID and source(s);
- category/type and source-specific severity scale;
- geometry/extent and precision;
- event time and uncertainty;
- first reported, last updated, retrieved, expiry, and revision/retraction state;
- supporting and contradictory reports;
- related places, entities, cameras, weather, roads, and hazards;
- coverage limits and confidence/quality fields where the source provides them;
- attribution and source links.

Build in this order:

1. `EE-EVENTS-0`: normalized event contract and registry.
2. `EE-EVENTS-1`: tiered source adapters and health/failure states.
3. `EE-EVENTS-2`: GLOBE event markers, filters, and source/time disclosure.
4. `EE-EVENTS-3`: event detail and related conditions in context.
5. `EE-EVENTS-4`: Analyst event queries and same-state map actions.
6. `EE-EVENTS-5`: permitted history, corrections, retractions, and timeline behavior.
7. `EE-EVENTS-6`: follow/update mechanism only when a real retention and notification mechanism exists.

Candidate sources are source-reviewed tiers, including GDACS, ReliefWeb, NWS/CAP, existing Earth Eye sources, GDELT for news-report discovery, and publisher feeds only where their terms permit. Related conditions are not proof of causation. Do not infer conflict, attack, safety, responsibility, casualties, front lines, or damage from proximity, thermal imagery, missing tracks, headlines, or silence.

## 13. Eighteen acceptance journeys

Acceptance is demonstrated through complete journeys, including failure and recovery branches. The 18 required journeys are:

1. **Login and private beta:** authorized login, closed registration, session expiry, logout, and unauthorized rejection.
2. **iPhone shell:** physical iPhone opens the globe, bottom navigation, safe areas, keyboard/rotation/enlarged text, and panel close/restore correctly.
3. **Panel/list behavior:** a long list reaches its last item, scrolls independently of the globe, preserves tab scroll, and closes only through the intended handle/close action.
4. **Place search and details:** search a place, select it, inspect sourced details, see coverage/timing, and return to the same selection.
5. **Layer/source health:** open layers, enable an allowed source, observe READY/DEGRADED/NO DATA/NEEDS KEY/NO COVERAGE/OFFLINE, and recover after retry or network return.
6. **Camera discovery:** rank in-view/nearest/quality cameras, select a marker/list match, and open the exact camera detail.
7. **Camera playback:** distinguish LIVE VIDEO, VIDEO CLIP, REFRESHED STILL, HISTORICAL/ARCHIVED, and UNAVAILABLE; test play, autoplay rejection, fullscreen, retry, close cleanup, and source link.
8. **Aircraft select/follow:** select a source-identified aircraft, inspect source age/delay, follow its live position, then handle stale/lost data without invented motion.
9. **Aircraft contacts/cockpit switch:** enter first-person Cockpit only through a valid selected/tracked aircraft, use Previous/Next where available, switch contacts, exit, and restore the same entity.
10. **Satellite:** select a satellite, inspect element epoch/age, ground track/orbit/pass prediction, and receive an honest unavailable state when elements are absent.
11. **Vessel/coverage:** inspect authorized vessel/AIS data, distinguish reported/interpolated/unknown coverage, and never infer underwater activity or routes.
12. **Roads and traffic:** investigate a stuck road request, show sourced geometry/flow/closure semantics, and prove that provider failure does not become clear traffic or fake cars.
13. **Interactive weather:** open a weather layer, inspect legend/units/frame time, scrub/play/pause, compare observation/forecast/warning semantics, and handle missing frames.
14. **Hazard/event context:** open an event, inspect provenance and uncertainty, view related conditions, and demonstrate that related data is not asserted as causal proof.
15. **Analyst same state:** ask a bounded question, inspect cited evidence, open the exact returned entity, issue a separate map action, and preserve selection/scope/time across surfaces.
16. **Drawing, measure, and route:** draw on desktop/touch, measure, and obtain a sourced route; if routing fails, show failure/partial endpoints and never draw a straight-line route as a route.
17. **Imagery/scenes:** perform recent-imagery two-date comparison and import/play/share a permitted scene while excluding synthetic/default-forbidden layers and preserving attribution.
18. **Owner controls and recovery:** owner-only source/key/license surfaces remain protected; missing keys, provider outages, WebGL loss, network loss, and rollback/restart recover without exposing secrets or fabricating state.

Each journey records device/browser, representative network and workload, exact steps, observed source/times, screenshots or logs where appropriate, failure branch, and regression protection.

## 14. Physical-iPhone gate

The physical-iPhone gate is mandatory for claims about mobile readiness. It is incomplete until the owner’s target iPhone pass is recorded.

Required checklist:

- login/private-beta boundary;
- bottom navigation and globe interaction;
- safe-area and dynamic viewport behavior;
- panel peek/half/full behavior and independent scroll to the last item;
- globe gestures do not steal panel scroll;
- keyboard, rotation, enlarged text, and reduced motion;
- selection preserved across map, list, detail, Analyst, and camera viewer;
- camera play/autoplay fallback/fullscreen/close cleanup;
- aircraft follow/stale state and Cockpit entry/exit where supported;
- weather interactive controls and readable legends;
- offline, slow-provider, missing-key, and session-expiry states;
- no unbounded memory, media download, handler, or GPU work after close;
- Chromium/desktop evidence reported separately from WebKit/physical-iPhone evidence.

Until this gate passes, label the feature **awaiting real-device test**, not mobile-ready.

## 15. COMMS override and Path A boundary

The newer COMMS decision overrides older language that permanently excluded radio/scanner work. It does not weaken any restriction on ALPR, face identification, private-person tracking, fabricated observations, hacked feeds, unauthorized cameras, restricted/encrypted bypass, or fictional contacts.

COMMS is a separate provider-neutral surface, not music radio and not evidence of an incident. The current status is:

- Broadcastify — integration candidate / credentials and terms to verify;
- OpenMHz — permission required;
- RadioReference — license required;
- LiveATC — blocked by provider terms;
- local SDR — optional owner hardware, with lawful input only.

Until each provider’s display/embed/proxy/storage/analysis permissions are verified, keep it held or unavailable with clear UI. Do not let a control, scene, Analyst answer, or upstream schema imply that a feed works merely because it is listed.

## 16. Upstream change policy

- Keep `81eb443` as the pinned comparison until an explicit re-pin is recorded.
- At each planned reconciliation stage, record upstream head, range after the pin, relevant PR/branch, license/permission review, and Earth Eye delta.
- Never wholesale-merge upstream or overwrite Earth Eye’s auth, registry, policy, mobile, source, or honesty work.
- Prefer a small, reviewable port of a specific fix. Keep excluded paths out of panels, actions, scenes, share tokens, and fallback code.
- Require tests and at least one affected acceptance journey before calling a port complete.
- Recheck source terms when upstream changes provider, cache, imagery, models, traffic, news, weather, camera, or communications behavior.
- If upstream changes the meaning of a live label, layer, action, or camera mode, stop the claim at `unverified` until the product and evidence are reconciled.
- Preserve rollback points and document the reason for accepting, holding, adapting, or rejecting each delta.

## 17. Final product acceptance standard

Earth Eye is accepted only when the demonstrated journey works end to end:

> **discover/select → inspect evidence → see related conditions → map/viewer action → follow updates where a real mechanism exists**

Acceptance requires all of the following:

- authentic, authorized, source-grounded data;
- separate observation, event, publication, retrieval, display, and expiry times;
- explicit coverage, permission, freshness, uncertainty, and failure state;
- one shared selection, viewport, layer, filter, and time contract;
- 30 action schemas accounted for and validated or honestly held;
- 28 layer families accounted for with real provenance;
- LIVE EARTH that is connected but never busywork;
- World Events that adds context without false causation;
- Cockpit that is clearly synthetic first-person presentation, never onboard video;
- Photoreal chain and key/billing boundary honored;
- COMMS handled lawfully under the override and not smuggled into an unsupported claim;
- physical-iPhone evidence for mobile claims;
- outage, stale, empty, no-key, no-coverage, permission-held, and recovery paths tested;
- no dead controls, no simulated traffic in the real-data default, no fictional contacts, no source-term bypass, and no secret leakage;
- issue → root cause → fix → evidence → regression protection recorded for each defect.

**Current sequencing note:** EE-LIVE-3 is in flight. Complete or unblock the LIVE slice first. Perform the Cockpit and upstream deltas after that slice unless a narrowly documented delta is a proven blocker; do not use reconciliation as a reason to interrupt or redesign the active application.

## END DIRECTIVE
