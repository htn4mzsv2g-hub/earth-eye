# EE-LIVE-2 — Findings (nav IA + capability + login leakage)

**Recorded:** 2026-09-29 ~5:45 AM CDT  
**Scope:** Live World Phases 2–4 only (canonical IA, sanitized capabilities, login cleanup).  
**Shipped as Fly v46** `registry.fly.io/eartheye:deployment-01M3PBZDAY3DHAY5V29FGQGBJC`.

**Rollback tip:** Fly **v45** `registry.fly.io/eartheye:deployment-01M3PBHNM92GYJQKGC33DZBCH2` (also recorded as EE-LIVE-1 tip; LIVE-0 listed v44).

## Phase 2 — Information architecture

| Surface | Before | After |
| --- | --- | --- |
| Mobile tabs | Already GLOBE / TRACK / CAMERAS / ANALYST + MORE | Unchanged labels; MORE groups remapped |
| Mobile MORE | SYSTEM (sources/keys/**location**/share), EXPERIENCE (scenes/display/visual/**context**/…), INFORMATION, ACCOUNT | **GLOBE** (LOCATION, CONTEXT, SHARE) + **MORE** (sources/keys/scenes/display/visual/voice/cam layer/hud/snap/tour/licenses/safety) + ACCOUNT |
| Desktop dock | SOURCES, CAMERAS, EXPLORE, ANALYST, KEYS, SNAP, TOUR, LICENSES, SAFETY | Primary **GLOBE / TRACK / CAMERAS / ANALYST / MORE**; MORE drawer holds sources/keys/licenses/safety/snap/tour |
| Shared contract | Implicit / divergent labels | `src/atlas/canonicalIa.js` — same destination IDs & ownership |

Desktop GLOBE opens Explore (search/location); layers remain on the map rail. TRACK/CAMERAS/ANALYST open the same panels as mobile.

## Phase 3 — Capability model

| Item | Detail |
| --- | --- |
| Owner secret API | `GET /api/atlas/provider-status` — env **names** + set/unset only. Now **owner-only** via `isOwnerOnlyApi`. Hosted preview skips loopback `admitKeySetup` so owner sessions on Fly can read it; reviewers get **403**. |
| Sanitized API | `GET /api/atlas/capabilities` — labels like `GOOGLE PHOTOREALISTIC 3D: NOT CONFIGURED`, `VESSELS: KEY REQUIRED`, `VOICE AI: NOT CONFIGURED`, `NASA FIRMS: DEGRADED\|AVAILABLE`, `OPENAI: DISABLED`. No env names, values, or credential metadata. |
| Keys UI | Non-owner → capabilities list only. Owner → capabilities summary + full provider-status detail / POWER UP when available. |

## Phase 4 — Login leakage

| Before | After |
| --- | --- |
| Apple/Google “CONFIGURATION REQUIRED” + details checklist with callback URLs and secret **names** | **CURRENTLY UNAVAILABLE** — no setup/env/callback text |
| Forgot page mentioned `LOGIN_PASS` / email env names | Honest private-beta copy without env names |
| Terms/Privacy “coming soon” stubs | Minimal honest private-beta placeholders (not finished legal claims) |

## Explicit non-goals (this slice)

LIVE EARTH preset (LIVE-3), camera rank, Analyst completion, World Events, Cesium rewrite, Photoreal billing, LOGIN_USER/LOGIN_PASS changes.
