# EARTH EYE — AIRCRAFT ATC AUDIO / COCKPIT COMMS DIRECTIVE

**Ruben — 2026-09-29, approximately 5:56 AM CT**  
**Documentation directive only. No code, deployment, billing, credential creation, recording, transcription, or provider activation is authorized by this document.**

This is the controlling amendment for aircraft ATC audio and the Cockpit COMMS surface. It is read with `AIRCRAFT_COCKPIT_DIRECTIVE_2026-09-29.md`, the newer COMMS decision, the Final Engineering master, and the controlling spec stack.

## 1. Executive decision and hard boundary

Aircraft ATC audio is an optional, source-grounded communications surface adjacent to Cockpit. It is not a scanner, onboard aircraft audio, a sensor, proof of an aircraft event, or a substitute for an aircraft position source.

The current owner gates are absolute:

- **Broadcastify — PERMISSION REQUIRED.** Credentials alone are not permission. Display, embed, playback, proxying, caching, recording, transcription, analysis, and redistribution terms must be verified by the owner before any audio integration.
- **LiveATC — THIRD-PARTY BLOCKED.** Do not integrate, scrape, proxy, embed, deep-link around controls, capture, record, transcribe, or reproduce LiveATC audio or pages. A public URL does not override this block.
- OpenMHz remains permission-required.
- RadioReference remains license-required.
- An owner-operated receiver/SDR is a future option only and is not an available source today.
- Encrypted, restricted, private, hacked, intercepted, or otherwise unauthorized audio is never an Earth Eye source.

**No audio implementation is permitted until the applicable owner/provider permission is recorded.** Until then, the product may document or display an honest held/unavailable capability state only. No fallback may silently substitute a different provider.

## 2. Product truth and semantic separation

The product must keep these facts separate:

1. An authorized aircraft track says what a source reported about an aircraft, at a stated time and coverage scope.
2. A frequency registry says that a frequency is assigned, published, or otherwise source-listed for a facility, sector, airport, or jurisdiction.
3. An authorized audio provider says that a particular stream/session is available and playable under its terms.
4. Audio content may contain a transmission, but audio silence, noise, a partial phrase, or a listener’s interpretation does not establish aircraft identity, location, intent, emergency, landing, mission, or outcome.
5. Cockpit remains a synthetic first-person presentation. ATC audio does not turn it into onboard video, a cockpit microphone, direct telemetry, or an aircraft sensor.

Every view and answer must expose provider/source, coverage, observation or publication time, retrieval time, freshness, permission state, and limitations where available. A frequency listed in a database is not evidence that audio is live. A playable stream is not evidence that every aircraft in view is participating in it.

Earth Eye must not infer or present as fact:

- a crash, landing, emergency, threat, mission, destination, or intent;
- a specific aircraft identity from voice, accent, timing, or proximity alone;
- a person or speaker identity;
- military, law-enforcement, or sensitive activity from an audio style or frequency;
- that a quiet channel means no traffic or that a busy channel explains an aircraft event;
- that a provider’s coverage is worldwide, current, complete, or lawful for redistribution.

## 3. Three confidence levels

The confidence label describes the strength and scope of the evidence for the specific statement. It is not a danger score, speaker score, truth score for the whole scene, or model-generated certainty.

### C1 — Source-confirmed

Use only for a narrow statement directly supported by an authorized source and its current metadata, such as:

- a provider has authorized a named stream and reports it playable;
- a published/source-owned frequency record assigns a value to a named facility or sector for a stated effective period;
- an authorized transcript or explicit human-reviewed transmission contains a stated callsign or phrase, with source and time recorded.

C1 does **not** automatically confirm that the selected aircraft is the speaker, that the transmission describes the selected aircraft, or that an event occurred. The UI must state exactly what the source confirms.

### C2 — Corroborated / source-supported

Use when two or more independent, authorized, time-compatible facts support a limited relationship, for example a source-identified aircraft, a source-published frequency/sector assignment, and a contemporaneous authorized transmission containing a compatible callsign. C2 means **consistent with** or **corroborated for the stated window**, not proven identity, causality, or intent.

C2 requires explicit evidence links/IDs and a visible time window. If source clocks, coverage, jurisdiction, or frequency assignment do not align, do not promote to C2.

### C3 — Context / unverified

Use for context that may help a user investigate but does not establish the claim: a nearby frequency, a general sector assignment, a partial/unreviewed phrase, a stale record, an inferred handoff, a geographic coincidence, or a user question unsupported by an authorized source. Label it **unverified**, **context only**, or **cannot determine**.

C3 must never be rendered with language, color, sound, animation, or an Analyst answer that implies confirmation. If the evidence is absent, the correct answer is that Earth Eye cannot determine it.

### Promotion and demotion rules

- Never promote confidence because a track is visually close, a frequency is nearby, a stream is loud, or a model sounds certain.
- A stale, revoked, mismatched, or permission-held source demotes the claim or makes it unavailable.
- Confidence is claim-specific and time-bounded; C1 for stream availability is not C1 for aircraft identity.
- Human review or an authorized provider transcript must be provenance-labeled. Automatic speech recognition may assist a future workflow only if separately permitted and must not be presented as authoritative by default.

## 4. Provider and jurisdiction matrix

The matrix below is the default policy. A provider row is not approval to activate it.

| Source / jurisdiction | Audio status | Permission and lawful-use requirement | Allowed product posture | Explicit prohibition |
|---|---|---|---|---|
| Broadcastify public-safety/aviation feed | **PERMISSION REQUIRED** | Owner must verify account, feed, playback, embed/API, storage, recording, transcript, analysis, and redistribution rights for the intended Earth Eye use and jurisdiction | Hold as an integration candidate; show only a capability/permission-held state until recorded approval | No credentials-only activation, scraping, proxying, caching, recording, transcript, or redistribution before permission |
| LiveATC or LiveATC-origin audio/page | **THIRD-PARTY BLOCKED** | Provider terms block Earth Eye integration; no approval is assumed from public accessibility | Keep unavailable and explain the block without exposing a playable path | No embed, scrape, proxy, deep-link workaround, capture, recording, copying, transcription, or analysis |
| OpenMHz | **PERMISSION REQUIRED** | Verify provider permission and each feed’s terms, coverage, playback, and storage conditions | Hold pending documented permission | No activation or substitute claim before permission |
| RadioReference | **LICENSE REQUIRED** | Verify the required commercial/product license and all feed/API/recording terms | Hold pending license and scope confirmation | No use under a personal account or assumed public license |
| Earth Eye owner-operated receiver/SDR | **FUTURE ONLY** | Owner hardware, local configuration, applicable reception/recording law, and an explicit product policy are required | Design an adapter boundary only; no receiver audio now | No fabricated receiver, no remote relay by default, no encrypted/private reception, no cloud upload or recording without separate approval |
| Other public, airport, agency, or jurisdictional source | **UNVERIFIED UNTIL REVIEWED** | Verify the source owner, geographic law, redistribution/recording/transcription terms, retention, and commercial use | Metadata-only or held state until review is complete | “Public,” “open,” or “airband” does not mean free to capture or redistribute |
| Encrypted, restricted, private, hacked, or unauthorized source | **BLOCKED** | No permission path is assumed | Never list as available audio; optionally show a general safety limitation | No access, decoding, bypass, interception, publication, or inference from it |

Jurisdiction is a first-class field. A source approved in one country, state, airport, facility, or feed scope does not grant permission in another. When jurisdiction, ownership, terms, or geographic coverage is unknown, use C3/held and do not activate audio.

## 5. Frequency data contract

Frequency data is metadata, not audio. It may be displayed only with provenance and effective time. The minimum normalized record is:

```text
frequencyId
valueMHz / channelLabel / unit
mode (provider-owned; never guessed)
facility, airport, sector, service, and airspace labels
jurisdiction and geographic coverage
providerId, providerFeedId, sourceRecordId, provenanceUrl
publishedAt, observedAt, effectiveFrom, effectiveTo, retrievedAt
sourceVersion, freshness, confidence (C1/C2/C3)
audioAvailability: available | held | unavailable | blocked | unknown
permissionState: approved | required | license-required | blocked | unknown
recording/transcription/redistribution restrictions
lastVerifiedAt and owner/review note
```

Rules:

- Preserve the source’s value, units, labels, precision, and mode; do not invent a channel or convert an approximate value into false precision.
- Show “frequency listed” separately from “audio available,” “audio authorized,” and “currently receiving traffic.”
- An outdated chart, static directory, map proximity, or frequency adjacency cannot create a current handoff or active stream.
- Do not scrape frequency catalogs or provider pages where the terms do not allow it.
- If a frequency has no lawful audio source, it can remain a source-attributed metadata record only, with a clear `AUDIO UNAVAILABLE` state.
- Frequency selection must preserve the selected aircraft/scene context but must not claim that the frequency belongs to that aircraft without source evidence.

## 6. Handoffs architecture

“Handoff” has two distinct meanings and must not be conflated:

1. **Operational/frequency handoff:** a source may publish or explicitly report that a facility/sector directs traffic to another frequency.
2. **Product/provider handoff:** Earth Eye changes a selected source or audio session between provider adapters.

The future architecture is provider-neutral and permission-gated:

```text
source registry
  → permission/jurisdiction policy gate
  → aircraft + frequency evidence resolver
  → provider adapter/session broker
  → Cockpit listen controller
  → shared COMMS state + Analyst evidence
```

A source-backed handoff record may contain `fromFrequency`, `toFrequency`, `fromFacility`, `toFacility`, `sourceRecordId`, effective time, jurisdiction, confidence, and whether the next source is actually available. The UI may show **NEXT FREQUENCY SUGGESTED** or **HANDOFF REPORTED**. It must not silently tune, fetch, or play the next source.

Required behavior when implemented:

- Entry to Cockpit never starts audio.
- A user explicitly selects `LISTEN` for an authorized source/session.
- A handoff suggestion requires explicit user confirmation before changing frequency/provider.
- The old session is stopped or placed in a clearly visible, provider-supported state; no hidden parallel audio sessions may continue.
- The selected aircraft, track source, frequency record, audio provider, and time window remain separate IDs in shared state.
- A provider may reject a handoff. Preserve the current session or show `HANDOFF UNAVAILABLE`; never fabricate the destination stream.
- Late responses, stale handoff events, route changes, selection changes, and Cockpit exit cannot reopen or retune a disposed session.
- No background playback, auto-resume, automatic frequency cycling, or audio after leaving Cockpit.

## 7. Cockpit listen control and UX

The listen control is manual-first and consent-bound:

- A visible `LISTEN` control is required. `STOP` must be equally visible while active.
- No autoplay on page load, Cockpit entry, aircraft selection, contact switch, hover, route transition, source refresh, or handoff suggestion.
- A browser media policy prompt or user gesture must not be bypassed. Muted autoplay is not a substitute for an explicit listening action.
- Before activation, show provider, frequency/label, jurisdiction, permission state, coverage, source time, and whether the content is live, delayed, or replayed.
- The control is disabled with a truthful reason for `PERMISSION REQUIRED`, `THIRD-PARTY BLOCKED`, `LICENSE REQUIRED`, `NO COVERAGE`, `NO AUDIO`, `STALE`, `SOURCE ERROR`, `OFFLINE`, or `NOT CONFIGURED`.
- Volume and mute are user controls; the application must not force volume on, unmute on navigation, or hide an active session.
- A visible active-session indicator includes provider, frequency, start time, last media/metadata receipt, and stop control. Silence is shown as silence/unknown, not “no activity.”
- Cockpit selection and audio selection are related but independent. Changing aircraft must not silently retune audio; changing audio must not rewrite aircraft identity.
- Audio must stop on `STOP`, Cockpit exit, account/session end, provider revocation, or policy failure. Cleanup includes media elements, streams, timers, subscriptions, and pending callbacks.
- Audio controls must be usable on desktop and physical iPhone/WebKit, with safe areas, focus order, reduced motion, and no gesture theft from the globe.

Audio is never a required dependency for entering or using Cockpit. A missing or held provider must not degrade the aircraft track into a fake radio experience.

## 8. Future own-receiver boundary

An owner-operated receiver/SDR may be considered in a later, separately approved phase. The future adapter must require:

- confirmed owner hardware and an explicit local configuration;
- source, location, time, frequency, mode, and receiver status metadata;
- lawful reception and use for the actual jurisdiction;
- explicit user start/stop and a default of no remote relay, recording, cloud upload, or retention;
- no encrypted, private, restricted, or bypassed content;
- clear separation between local receiver audio and third-party provider audio;
- bounded resource use and complete cleanup when Cockpit exits.

The design must not claim that an owner receiver provides universal coverage, aircraft identity, or permission to publish. No own-receiver implementation is authorized by this directive.

## 9. Future callsign correlation boundary

Calls-sign correlation is a future evidence feature, not an automatic identity system. It may be considered only when an authorized source supplies compatible evidence across a stated time window, such as:

- a provider-qualified aircraft/entity ID and source timestamp;
- a frequency/facility/sector record with provenance and effective time;
- an authorized transmission or provider transcript with the callsign, if transcription is permitted;
- compatible coverage and jurisdiction; and
- no conflicting source or stale-state condition.

The result must be a candidate relationship with C2 or C3 wording, evidence IDs, time window, and limitations. It must never be “voice matched,” speaker identified, person identified, or treated as proof that the selected aircraft transmitted. No biometric voiceprint, face/identity enrichment, private-person tracking, or callsign invention is permitted. A callsign absent from the source remains unknown.

## 10. Analyst confidence answers

Analyst answers must be generated from the shared COMMS evidence contract, not model memory or audio imagination. Each answer returns:

```text
answer
confidence: C1 | C2 | C3 | cannot-determine
claimScope
source/provider and source IDs
frequency/facility/jurisdiction
observation/publication/retrieval times
coverage and freshness
limitations / permission state
available map or Cockpit action, if any
```

Required answer style:

- **C1:** “The authorized source reports/shows [narrow fact] at [time]. This confirms the source record, not aircraft intent or event outcome.”
- **C2:** “The aircraft track and authorized COMMS evidence are consistent with [limited relationship] during [window]. This does not prove that the aircraft was the speaker or establish causation.”
- **C3:** “The available frequency/audio context is [fact]. Earth Eye cannot verify that it belongs to [aircraft/event].”
- **Cannot determine:** “Earth Eye cannot determine this from the authorized sources available. [Permission/coverage/freshness/identity limitation].”

Examples:

| Question | Correct answer boundary |
|---|---|
| “Is audio available?” | State provider permission, stream status, coverage, and time. Availability does not confirm aircraft activity. |
| “What frequency is listed?” | Return a source-attributed frequency record, effective dates, jurisdiction, and confidence. Do not say it is currently active unless supported. |
| “Did this aircraft call ATC?” | C1 only for an explicit authorized transmission/transcript; C2 for a documented compatible correlation; otherwise C3 or cannot determine. Never infer from proximity or voice style. |
| “Did it land / declare an emergency / receive a clearance?” | Do not infer. Answer cannot determine unless an authorized source explicitly supports the narrow statement, with time and limitations. |
| “Why is the channel quiet?” | Say only that no usable transmission was observed in the stated window, if true. Silence is not proof of no traffic. |
| “What is the next frequency?” | Show only a source-reported handoff suggestion and require user confirmation; do not tune automatically. |
| “Is this a military or sensitive operation?” | Do not infer from audio, callsign, frequency, or aircraft proximity. Use provider-owned classification only where explicitly sourced. |

Analyst must not answer a held, blocked, stale, private, encrypted, or unauthorized source as if it were live evidence. Unsupported audio questions remain outside the deterministic baseline until this directive’s permission gate is satisfied.

## 11. Failure states and recovery

Every state must terminate honestly; no infinite spinner, silent fallback, or fabricated waveform is allowed.

| Failure/state | Required UI meaning and behavior |
|---|---|
| `PERMISSION REQUIRED` | Provider may be known, but owner approval is not recorded. No playback, fetch, proxy, recording, transcript, or analysis. |
| `THIRD-PARTY BLOCKED` | LiveATC is unavailable by provider boundary. Do not offer a retry that repeats the prohibited integration. |
| `LICENSE REQUIRED` | Required commercial/product license is absent. Keep audio disabled. |
| `NOT CONFIGURED` | No owner-approved credentials, adapter, receiver, or feed configuration exists. |
| `NO COVERAGE` | The source does not cover the location/frequency/window. Do not substitute nearby coverage as the same source. |
| `AUDIO UNAVAILABLE / METADATA ONLY` | A frequency or facility record exists, but no authorized playable audio exists. |
| `STALE` | Metadata or audio status exceeds its source-specific freshness window. Mark stale and stop claims of current availability. |
| `HANDOFF UNAVAILABLE` | A suggestion has no authorized destination or the provider rejected it. Preserve current state or stop; never auto-tune. |
| `PLAYBACK BLOCKED` | Browser/device/user gesture/media policy blocked playback. Explain and require an explicit user retry; do not autoplay workaround. |
| `SOURCE ERROR / 429 / 5xx` | Show provider error and bounded retry/backoff. Do not spin, duplicate sessions, or replace with invented audio. |
| `OFFLINE` | No current network/provider confirmation. Retain last metadata only as stale, never as live audio. |
| `SILENCE / NO TRANSMISSION OBSERVED` | Report only the observation window if available. Do not convert silence into “no aircraft” or “no event.” |
| `MISMATCHED SOURCE` | Frequency, aircraft, jurisdiction, or time evidence conflicts. Suppress correlation and demote confidence. |
| `RESTRICTED / ENCRYPTED / PRIVATE` | Blocked permanently for the product path; no decoding, bypass, or disclosure. |
| `SELECTION LOST / COCKPIT EXITED` | Stop or dispose of the audio session and clear active-listen state. Do not retain hidden playback. |
| `REVOKED / TERMS CHANGED` | Stop activation and mark held pending owner review. Existing approval is not permanent. |

Recovery must preserve the last known source fact with its timestamp and stale label, allow a user-visible retry only where lawful, and never make a failed provider look like a working one.

## 12. Implementation gates and acceptance

This document records policy and architecture only. If owner permission is later supplied, work must proceed as separately reviewable gates:

1. **ATC-0 — audit:** inventory existing radio/COMMS code, actions, routes, media elements, source registry, and any accidental provider references. Keep audio disabled.
2. **ATC-1 — contracts:** add provider-neutral metadata, permission, jurisdiction, frequency, confidence, handoff, and failure schemas without playback.
3. **ATC-2 — owner gate:** record Broadcastify permission or other provider approval with exact scope, dates, feed IDs, permitted operations, retention, and jurisdiction. No “credential present” shortcut.
4. **ATC-3 — manual listen UX:** implement explicit listen/stop, no autoplay, visible source state, cleanup, device/browser policy handling, and acceptance evidence.
5. **ATC-4 — handoffs:** expose only source-reported handoffs; require confirmation; test stale, rejected, missing, and conflicting destinations.
6. **ATC-5 — future receiver/correlation:** separately approve owner hardware and callsign evidence rules; do not bundle them into provider playback.

Acceptance must prove:

- Broadcastify remains held until permission is recorded;
- LiveATC cannot be activated or reached through a workaround;
- no unauthorized, encrypted, restricted, private, hacked, or fabricated audio exists;
- Cockpit entry, selection change, handoff suggestion, page load, and route changes never autoplay;
- explicit `LISTEN`/`STOP` works and all audio stops on exit or failure;
- frequency records show provenance, jurisdiction, effective time, freshness, and audio/permission separation;
- C1/C2/C3 answers are claim-specific, cited, time-bounded, and honest;
- callsign correlation is absent or visibly future/unsupported until separately approved;
- all failure states resolve to a truthful terminal state with no hidden sessions or timers;
- desktop and physical-iPhone behavior are tested separately before mobile claims.

## 13. Current status

**Current status: AUDIO NOT IMPLEMENTED.** Broadcastify is still the owner gate. Do not implement audio until permission is obtained and recorded. LiveATC remains third-party blocked. Frequency metadata, future own-receiver work, future callsign correlation, and Analyst COMMS answers must remain held to the boundaries above.

This amendment does not authorize code, deployment, billing, provider activation, recording, transcription, external communication, or a change to the active EE-LIVE sequencing. It documents the lawful path for a future review.

## END DIRECTIVE
