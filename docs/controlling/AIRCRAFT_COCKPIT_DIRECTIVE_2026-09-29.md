# EARTH EYE — AIRCRAFT COCKPIT / FIRST-PERSON DIRECTIVE

**Ruben — 2026-09-29, approximately 5:51 AM CT**  
**Documentation directive only. No code, deployment, billing, key creation, or provider activation is authorized by this document.**

This directive defines the Cockpit and first-person aircraft product surface. It preserves the upstream Cockpit capability while applying Earth Eye’s truth, permission, shared-state, mobile, performance, and acceptance rules.

## 1. Purpose and truth boundary

Cockpit is a synthetic first-person presentation built from an authorized aircraft track, terrain/imagery context, approved 3D models, and disclosed visual treatments. It is not:

- onboard video;
- a camera or sensor feed from the aircraft;
- thermal or night-vision measurement;
- direct telemetry from a private or military system;
- proof of a mission, threat, attack, crash, landing, destination, or intent;
- a claim of worldwide aircraft coverage.

The Cockpit must preserve the distinction between source-observed aircraft data, delayed/interpolated display position, model-rendered aircraft, terrain/imagery context, weather observation, and illustrative styling. The UI must make this distinction understandable without breaking the immersive presentation.

## 2. Admission and camera ownership

Cockpit admission is a stateful contract, not a free camera effect.

- A user selects or tracks an authorized source-identified aircraft first.
- The selected entity must have a stable provider-qualified ID, source time, location, and sufficient valid kinematics for the view.
- Cockpit entry is refused with a clear reason when there is no valid aircraft, selection is lost, source data is unusable, permission is absent, or the required context transaction has not settled.
- The Cockpit camera owns the view while active. Empty-globe clicks, ordinary map orbit, conflicting fly actions, and unrelated camera automation must not steal it.
- `COCKPIT`, `RESET`, `EXIT COCKPIT`, `C`, and `Escape` have explicit, consistent behavior. Reset exits Cockpit through the canonical globe route and releases camera ownership.
- Exit restores the same tracked/selected entity and ordinary follow camera when possible. It must not silently replace a lost selection with a fabricated or arbitrary aircraft.
- A pending camera or data callback cannot re-enter, move, or mutate a disposed Cockpit session.
- Entering Cockpit hides the selected aircraft’s trail body/head when necessary to keep the first-person view clear; exit restores normal map presentation.

Cockpit does not require a 250 km roster to claim a local view, but when Contacts is active the radius, source, and viewport limitations must be disclosed. Installation counts are current-viewport context, never a complete radius survey unless the source supports that claim.

## 3. Aircraft data and motion model

The camera follows the aircraft’s displayed source-grounded track, not an invented route.

- Display source, source delay, observation/fix time, retrieval time, and freshness separately.
- Use bounded interpolation only where permitted and disclose the intentional display delay separately from source age.
- Cap extrapolation. When a source is stale or lost, mark the track and Cockpit visibly stale, hold or safely exit according to the state policy, and stop invented motion.
- Do not infer a landing, crash, mission, threat, destination, military identity, or intent from movement, disappearance, altitude, color, proximity, or silence.
- Military status is shown only when the provider explicitly identifies it with provenance. Unknown remains unknown; no visual style may upgrade an unknown contact.
- Rendered altitude must use the appropriate source aviation/flight datum where available, not an accidental negative terrain/ellipsoid height. A confirmed grounded source may display `0 ft` without rewriting the source record.
- The first-person anchor may use a bounded inertial presentation between source updates, but corrections must not reverse or accelerate the view in a way that contradicts the source track. The authoritative delayed track remains the truth.
- Camera placement, textual instruments, context rails, and expensive layout work are bounded independently so a moving view does not force unbounded terrain traversal or frame work.
- No local receiver, ADS-B, OpenSky, adsb.lol, or other source is treated as universal. Coverage and terms are source-specific.

## 4. Synthetic aircraft and terrain presentation

Approved aircraft models may be used to make the first-person presentation readable. They need provenance and attribution where required.

- The pilot’s own airframe is not drawn across the first-person optical center.
- Ambient contacts may be billboards or approved glTF models according to a bounded distance/cap policy. Loading or cap failure falls back to a truthful 2D silhouette/pip, not a missing-data replacement.
- Model class, texture, color, NVG/FLIR/CRT/NOIR treatment, bloom, fog, and post-processing are presentation choices, not sensor measurements.
- Terrain, Photoreal, Esri, OSM, or other imagery is labeled by provider and date/state. A 3D city or terrain surface is contextual, not proof of current occupants, damage, traffic, or events.
- Photoreal uses the accepted chain `Google direct → ion Google 3D → Esri → OSM`; it remains key-required until owner verification. Cockpit must work honestly keyless and must not bypass attribution, caching, billing, or provider terms.
- Cold terrain or surface acquisition must resolve to a bounded fallback state. It may show `ACQUIRING SURFACE` briefly, then use an approved target-height fallback or a clear unavailable state rather than freezing indefinitely.

## 5. Cockpit visual system and controls

The Cockpit should feel like a coherent first-person aircraft view while keeping information legible and truthful.

### Required core presentation

- Callsign/aircraft identity only from the source record.
- Source/age/freshness and coordinates with the applicable datum/precision.
- Ground speed, heading/course, and altitude in a compact lower-center instrument cluster.
- Curved roll/pitch guides and a seven-division heading tape where the data supports them.
- Responsive altitude tape on the inside-right visor rim; it must not obscure the optical center and must remain bounded on wide screens.
- Optional speed tape on the inside-left rim using the same responsive geometry.
- MGRS/GSD/time or other intelligence HUD content only when sourced and enabled; it must remain peripheral and must not imply classification, NIIRS, thermal temperature, targeting, or collection capability that is not present.
- Clear top-level `COCKPIT`, `RESET`, and `EXIT COCKPIT` controls, not keyboard shortcuts alone.

### Vision treatments

The vision control is an interactive, manual-first carousel over:

- the inherited map preset;
- `CRT`;
- `NVG`;
- `FLIR`;
- `NOIR`.

Previous/current/next controls wrap and remain keyboard/touch accessible. The inherited entry is named directly and preserves the map style at entry. There is no empty `NONE` mode. Returning to the inherited style or exiting restores the pre-entry style and shader intensities.

`NVG`, `FLIR`, `CRT`, and `NOIR` are visual filters. They do not turn ordinary imagery into a sensor feed, create temperature readings, or alter source truth. Any detection overlay is separately governed and must not be presented as an onboard sensor.

### Layout and focus

- Cockpit left/right rails have independent collapse controls and a shared safe baseline.
- The left rail may expose Contact, Layers, and Scenes within an adaptive corridor; it must not cover the HUD, close/exit controls, lower instruments, or Cesium attribution.
- The right rail is a briefing carousel with Live Signals, Regional News, and Local Info pages.
- No panel may trap focus, steal globe gestures from its own scroll region, or leave an invisible handler/subscription running after exit.
- Keyboard focus rings, reduced motion, enlarged text, safe areas, rotation, and narrow screens are part of the product, not optional polish.
- Mobile uses a deliberate fallback layout. Desktop presentation is not claimed as a WebXR session.

## 6. Contacts, selection, and switching

When Contacts is active for the tracked aircraft, the compact Contact rail may show:

- the disclosed subject window/radius;
- cohort counts by source/category;
- nearest observed/mapped example with relative bearing and distance where calculated from real positions;
- freshness, uncertainty, and coverage labels;
- Previous and Next controls;
- an explicit collapse control.

Rules:

- Previous/Next selects only a real available contact in the current source/coverage window.
- A contact switch updates the shared selection contract before moving the camera, cancels obsolete regional/weather requests, and shows a bounded transition state.
- Selection identity remains consistent across map, list, details, Analyst, Contacts, and Cockpit.
- Losing the selected source exits or degrades safely; it never selects a replacement just to keep the animation moving.
- Civilian and military classifications remain provider-owned. Amber/green styling is not evidence by itself.
- Any track/model cap is disclosed through behavior: capped/loading contacts remain 2D or unavailable rather than silently disappearing as if absent.

## 7. Cockpit briefing and local information

The right-side briefing is evidence context, not a threat score or all-clear.

### Live Signals

Show authorized source-grounded nearby signals with source, time, type, distance, and freshness. Unknown feeds remain unknown. Empty, partial, stale, rate-limited, and unavailable states are distinct.

### Regional News

Headlines are location-matched reporting, not verified incidents, risk intelligence, or proof of safety. Show provider and publisher attribution, original link, publication time where available, and limitations. Prefer a permission-cleared provider such as GDELT for hosted/commercial use; Google News RSS remains subject to its personal/non-commercial terms unless separately authorized.

### Local Info

Place and weather context may use authorized OpenStreetMap/Nominatim and Open-Meteo paths with source credit, rate limits, cache behavior, observation time, and coverage. Location matching does not establish an incident or causal relationship.

### Carousel behavior

- Manual-first: Previous, Next, and direct page controls are always available.
- The visible `CYCLE OFF` / `CYCLE ON` control explicitly starts or stops any nine-second cycle.
- The cycle pauses on hover/focus and stops while collapsed, hidden, or outside Cockpit.
- Live data refresh may continue independently of page cycling.
- Empty news or unavailable local data uses compact truthful states instead of reserving a fake media frame.
- Changing aircraft aborts and replaces obsolete briefing requests.

## 8. Weather effects and WX opt-in

Cockpit weather effects are a source-backed optional presentation, not decorative weather.

- The briefing may show local observed conditions independently of the visual effect.
- A volumetric cloud pass may run only with a current authorized observation and explicit `WX ON` opt-in.
- Condition family, cloud cover, precipitation, visibility, wind speed, and direction bound the effect. No observation means clear/no effect—not synthetic storm clouds.
- The effect is bounded in resolution, ray steps, animation rate, and GPU cost; it is clipped to the visor and stops completely on exit or disable.
- `WX OFF` disables atmospheric rendering only; it does not suppress source-backed local information.
- Stale weather remains visibly stale and may be retained only within the approved source-specific stale window. No frame is made newer by re-rendering.
- No map-mode weather effect is silently restored from Cockpit.

## 9. COMMS and cockpit boundaries

The newer COMMS decision overrides the old blanket radio exclusion, but it does not turn Cockpit into a scanner or authorize interception.

- A lawful, permission-reviewed communications briefing/control may be exposed only when its provider and operation are approved.
- Broadcastify is candidate/credential-gated; OpenMHz is permission-required; RadioReference is license-required; LiveATC is blocked by provider terms; local SDR requires owner hardware.
- Encrypted, restricted, private, hacked, or unauthorized feeds remain unavailable.
- A communications panel must disclose provider, permission, source time, coverage, and failure state and must not imply that radio confirms an aircraft event.
- Cockpit selection, safety, and acceptance do not depend on communications being active.

## 10. Mobile and iPhone requirements

Cockpit is not mobile-ready until the physical-iPhone gate passes. Required checks include:

- entry and exit through the mobile shell without losing globe control;
- legible visor/instruments and controls in portrait and landscape;
- safe-area handling, dynamic viewport, enlarged text, reduced motion, and keyboard/focus behavior;
- rail/panel scrolling independent from globe gestures;
- Contacts Previous/Next and selection continuity;
- visual-carousel touch controls and restoration on exit;
- briefing carousel manual controls, cycle pause, and source/error states;
- weather opt-in/off, stale/unavailable state, and cleanup;
- no continued downloads, animation loops, event handlers, or GPU work after exit;
- WebKit/physical-device results separated from Chromium/desktop emulation.

Until owner-device evidence is recorded, mark Cockpit mobile status `awaiting real-device test` even if desktop tests pass.

## 11. Performance, cleanup, and resilience

Cockpit must remain a bounded product surface, not an always-on render loop.

- Keep camera updates, textual instruments, context/layout work, weather effects, contacts, models, and network polling on bounded cadences.
- Bound aircraft/model count and release or hide resources deliberately on entry, selection change, exit, and destroy.
- Coalesce duplicate source requests, cancel obsolete requests, back off on provider failure, and prevent late responses from replacing current state.
- Measure client rendering, server wake, network, provider latency, memory, GPU, and media separately.
- Test repeated open/close, contact switching, route changes, slow network, source 429/5xx, stale tracks, missing models, no Photoreal key, WebGL loss, and session expiry.
- A successful HTTP response does not prove useful/playable/current content.
- A performance improvement must not freeze moving tracks, hide evidence, or reduce truth to meet a benchmark.

## 12. Cockpit acceptance journeys

The Cockpit-specific acceptance record must cover:

1. Select a valid aircraft and enter Cockpit with source identity, time, delay, and coverage visible.
2. Follow the delayed/interpolated track and verify bounded motion, source age, stale warning, and no invented continuation.
3. Use Contacts, Previous/Next, and switch aircraft while preserving one shared selection state.
4. Use visual treatments and verify they change presentation only; no fake sensor/temperature/classification claim appears.
5. Inspect altitude, speed, heading, roll/pitch, coordinates, and route cue only when source data supports them; unsupported values are omitted or labeled.
6. Open Live Signals, Regional News, and Local Info; verify attribution, source time, scope, empty/partial/error states, and manual-first carousel behavior.
7. Opt into WX, verify source-backed behavior, then disable/exit and confirm complete atmospheric cleanup.
8. Exercise Reset, Exit, Escape, and selection loss; verify camera restoration and no replacement target.
9. Run the same entry, selection, briefing, and exit on desktop Chromium and physical iPhone/WebKit separately.
10. Repeat open/close and provider-failure loops; confirm no leaks, stale callbacks, downloads, or hidden timers.

Acceptance is not a cinematic screenshot. It is a source-grounded, repeatable journey with evidence and a recorded limitation list.

## 13. Final Cockpit standard

Cockpit is accepted when it provides an immersive, readable, responsive first-person aircraft view while remaining explicit that the view is synthetic and source-grounded. It must:

- follow an authorized real track without inventing motion;
- preserve selection identity across every surface;
- disclose source, timing, coverage, uncertainty, and failure;
- keep models, terrain, weather, news, and visual filters in their correct semantic categories;
- provide working controls or explain/disable them honestly;
- clean up all camera, network, media, animation, and GPU resources;
- pass the physical-iPhone gate before mobile claims;
- remain independent of unsupported keys, paid AI, Photoreal billing, or communications permissions;
- never imply onboard video, sensor truth, threat intelligence, or universal coverage.

**Sequencing:** EE-LIVE-3 is in flight. Cockpit/upstream delta work follows the LIVE slice unless a narrowly documented defect blocks it. No code or deployment work is implied by this document.

## END DIRECTIVE
