# EE-AUDIT-10 — ChatGPT non-3D desktop workflow fixes

**Recorded:** 2026-09-29 (America/Chicago)  
**Shipped:** Fly **v58** `deployment-01M3PGAHGY0RGMBPRWY6A64BD0` (branch `fix/audit10-workflow` @ `b15ea56`).
**Rollback:** Fly **v57** `deployment-01M3PFRJK7KJW6955G5AKXH6XN`.
**Base before this work:** Fly v57 tip; git historically `b48f4b0` + dirty EE-LIVE/EVENTS tree (v50–v57).  
**Scope:** Fix the 10 observed v55 workflow failures from the ChatGPT non-3D desktop audit. No EE-EVENTS-5+, no Photoreal billing, no fake data, no relaxed security.

## Deliverable table

| # | Observed | Root cause | Change | Verification | Remaining limitation |
| --- | --- | --- | --- | --- | --- |
| 1 | Shared selection not authoritative; Analyst “What is this?” / `selected_entity` often empty; Cesium-tied | Selection lived on Cesium entity carriers; `isContextRecordActive` cleared unknown layers (`place` / `world-events`); no place/camera publish path; parser missed “what is this” | `src/atlas/sharedSelection.js` + contextStore synthetic carriers; place/camera publish; viewer close **RETAIN** default; parser + Analyst identity read shared slot | `audit10Workflow.test.mjs` journeys 1; `what is this` → `selected_entity` | Globe pick still uses Cesium when 3D up; non-3D list/place/camera/events share one contract |
| 2 | Analyst open camera UNAVAILABLE / not SUCCESS without globe | `select_entity` in `MAP_ACTION_TOOLS` + no `graphicsRequired: false` — blocked when renderer down | `graphicsRequired: false` on `select_entity`; removed from `MAP_ACTION_TOOLS`; SUCCESS only after shared CAMERAS `openViewer`; publishes selection | Journey 1/2; open camera note mentions shared viewer | Non-cctv `select_entity` still UNAVAILABLE without 3D (honest) |
| 3 | Place “Select location” missing / tied to Fly here; “in view” without viewport | Explore only offered Fly here; quick places flew immediately | Explore **Select location** button; Fly · UNAVAILABLE in non-3D; nearby uses selected coords; never invents viewport | Journey 3 | Physical geolocation still optional fallback when nothing selected |
| 4 | TRACK Show silent no-op in non-3D | `set_layer` treated as map action → UNAVAILABLE; UI ignored result | `set_layer` `graphicsRequired: false`; TRACK uses direct `setLayer` + status note; Show enables list/details; Follow/Cockpit/Nearest stay UNAVAILABLE | Journey 4 | Globe markers for track layers still need 3D |
| 5 | Logout not discoverable in MORE (reviewer, both modes) | Desktop LOG OUT appended to dock trailing edge, not MORE drawer | After `mountSessionControl`, move SECURITY + LOG OUT into MORE → ACCOUNT | Code path in `console.js`; session still POST `/logout` | Mobile already relocated logout into MORE ACCOUNT |
| 6 | Non-3D claimed “GLOBE MARKERS ON / N markers” | Events panel always used globe-marker chrome | When `rendererDown`: **Map unavailable** + “N records have map locations”; markers button UNAVAILABLE | Journey 6 | Cohort count is plottable candidates, not painted markers |
| 7 | Recovery banner covered command bar; Retry could stack | Full banner `z-index: 1200` above command bar; remount could duplicate | Compact banner under command bar (`z-index: 150`); Dismiss; Retry one-shot / replace existing | Journey 7; `graphicsRecovery.test.mjs` | `?ee_non3d=1` forces non-3D for that navigation only. A stored flag does not |
| 8 | Empty camera states conflated live/area/filters | Single empty string | Distinguish catalog-wide no live (offer clips/stills), no area coverage, filters | Code + honesty line in `cctvBrowser.js` | Catalog contents depend on real packs |
| 9 | Health conflated provider vs layer vs rendered (USGS READY vs Sources OFF) | Single status string | `source_health` scopes: provider / collection / layer / rendered; SOURCES panel note | Journey 9 | Collection row needs `/api/atlas/collection-health` when present |
| 10 | Event details: opaque IDs, unlabeled times, weak pagination / causation risk | Flat ID line; ISO only; weak page copy | Expandable ID; labeled CT timestamps; source links; pagination clarity; RELATED ≠ causation preserved | Journey 10; eventsDetail3 tests | CT label needs parseable ISO/epoch |

## Tests

```bash
node --test src/atlas/audit10Workflow.test.mjs src/app/graphicsRecovery.test.mjs
# also: eventsDetail3 / eventsUx / analystIdentity
```

## Explicit non-claims

Audit did **not** verify 3D / iPhone / aircraft movement / weather / roads — do not claim those passed.

## Secrets

Do **not** commit `.reviewer-cred.local` (gitignored). No LOGIN_* / SESSION_SECRET in docs.
