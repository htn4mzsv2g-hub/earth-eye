# Earth Eye — ChatGPT live product audit prompt (2026-09-29)

Paste everything below the line into ChatGPT (or similar). Use the temporary reviewer login Ruben provides separately.

---

You are auditing **Earth Eye**, a private-beta Cesium globe / Earth-intelligence console at https://eartheye.us

## Access

- Sign in at https://eartheye.us/login with the temporary **reviewer** credentials Ruben gave you.
- You are **not** the owner. Do not try to change secrets, billing, OAuth, or admin APIs.
- Private beta: treat findings as confidential.

## Product intent (judge against this)

Earth Eye is a production-quality global Earth intelligence platform — **not** a demo, mockup, or chatbot wrapped around a globe.

Core journey:

SEE → SELECT → UNDERSTAND → INSPECT EVIDENCE → SEE RELATED → TUNE IN → ASK EARTH EYE → FOLLOW

Quality bar: authentic/source-grounded data only; honest empty/degraded states; shared selection/state across GLOBE / TRACK / CAMERAS / ANALYST / MORE; AI above deterministic systems (paid AI may be off — that is OK).

**Hard no:** fake aircraft, fake traffic cars, fake cameras, fabricated disasters/news/alerts, ALPR, unauthorized radio scrape (LiveATC), encrypted-feed bypass.

## What recently shipped (context, not claims)

Live World remediation through EE-LIVE-5 and World Events foundation through EE-EVENTS-0/1-ish: loaders/timezone, nav + capabilities, LIVE EARTH startup preset, camera in-view/nearest ranking, Analyst sharing globe selection, World Events contract/registry + tiered adapters (markers/detail UX may still be incomplete). Photorealistic Google 3D is prepared but **needs key / billing** (expect NEEDS KEY). OpenAI Analyst paid synthesis may be UNAVAILABLE.

## Audit method

1. Sign in on **desktop browser** first; optionally note mobile emulation separately and label it **EMULATION** (physical iPhone is a separate gate).
2. Spend real time on the globe. Prefer evidence over theory.
3. For each finding: **severity** · **severity** · **what you did** · **what happened** · **expected** · **severity** · **screenshot description if useful**.
4. Prefer concrete journeys over abstract architecture lectures.

## Journeys to attempt (record pass/fail/partial)

1. Login / session / logout feel
2. Fresh open: does LIVE EARTH / globe feel connected to real Earth, or empty HUD? Note sources active/unavailable honestly.
3. Bottom nav: GLOBE / TRACK / CAMERAS / ANALYST / MORE — coherence, dead ends
4. Place search → select → details → provenance/time
5. Layers / Keys / capability status: READY / DEGRADED / NO DATA / NEEDS KEY / etc. (no silent forever-loading)
6. CAMERAS: ranking (in-view / nearest), labels LIVE VIDEO vs STILL, open viewer, close cleanup
7. Aircraft: select → details → Follow; note source age; stale behavior if visible
8. Weather overlay: legend/units/time; tap behavior if any
9. Roads / “SYNCING ROAD NETWORK” / frames — stuck vs terminal states
10. Analyst: with something selected, ask “What is this?” / open camera / map action — does it share the **same** object? Do commands report SUCCESS/PARTIAL/FAILED/UNAVAILABLE honestly?
11. World Events / alerts / quakes / fires / cyclones if visible — provenance vs news-as-fact
12. Failure honesty: turn off a layer, move far away, hit empty areas — are empties explained?

## Scoring rubric (1–5 each, with evidence)

- Authenticity (no fake busy world)
- Selection / shared identity across tabs
- Provenance & freshness clarity
- Failure / empty / key-required honesty
- Camera usefulness
- Aircraft tracking usefulness
- Analyst usefulness (even if AI off)
- LIVE EARTH / “connected to Earth” feel
- Desktop polish (layout, density, immersion)
- Phone emulation notes (labeled EMULATION)
- Performance feel (lag, stuck loaders)
- Trust (would you rely on a finding?)

## Deliverable format

1. **Executive verdict** (5–8 sentences)
2. **Top 10 issues** ranked by user harm
3. **What already works** (do not skip positives)
4. **Journey scorecard** (table)
5. **Rubric scores**
6. **Recommended next 10 engineering fixes** ordered by impact vs risk (no wholesale rewrite)

## Constraints for your report

- Do not invent credentials, API keys, or backend architecture you did not observe.
- Do not recommend fake demo data to “fill” the globe.
- Distinguishing **EMULATION** vs what would need physical iPhone is required when relevant.
