# Operator UX — UX-0 Audit

**Date:** 2026-09-29 (CT)  
**Directive:** `docs/OPERATOR_UX_DIRECTIVE_2026-09-29.md`  
**Evidence:** `docs/operator-ux-screenshots/iphone-{1..5}.png` (MORE / Analyst / Cameras / Layers / Explore)

## Broken chrome (from owner iPhone shots)

| Issue | Evidence | Target |
|-------|----------|--------|
| Huge logo + `?/10 KEYS` + always-on command bar eat ~top third | all 5 | Compact header; keys → Sources/Keys; ASK EARTH EYE expand |
| Bottom nav EXPLORE\|LAYERS\|CAMERAS\|ANALYST\|MORE | all 5 | GLOBE\|TRACK\|CAMERAS\|ANALYST\|MORE; layers from GLOBE |
| MORE = flat 20-button grid incl. NORTH/TILT | iphone-1 | Grouped SYSTEM/EXPERIENCE/INFORMATION/ACCOUNT; NORTH/TILT floating on globe |
| Analyst AI-off banner dominates sheet | iphone-2 | Compact one-line strip |
| Cameras honesty/stats before useful list | iphone-3 | Content first; honesty compact |
| Sheets lack clear PEEK/HALF/FULL | all | Height snaps + handle; scroll content only |

## Preserve (do not rewrite)

Data architecture, providers, registry, auth, Analyst tools/actions, Cesium, cameras catalog, scenes, routing/NAV-2, Stage work, AO-0 OpenAI hard-off, Option C, Broadcastify HELD, LiveATC blocked.

## Priority order (owner)

1. Globe chrome (header / ASK / tabs / MORE groups / NORTH·TILT)
2. Follow (SELECT vs FOLLOW, live track, STALE, cockpit honesty)
3. Sheet contract (PEEK/HALF/FULL)
4. TRACK workspace counts → traffic honesty → cameras → Analyst polish → contextual actions → toasts

## Code touchpoints (reuse)

- `src/atlas/mobilePolicy.js` — tab/sheet definitions
- `src/atlas/mobileShell.js` / `mobile.css` — compact chrome
- `src/atlas/console.js` — command bar, dock, panels
- `src/atlas/analystPanel.js` — Analyst / Explore UI
- `src/ui/navigationController.js`, `cockpitTrackingController.js`, `trackedCamera.js` — Follow
- `src/atlas/dataSourceRegistry.js` + TomTom traffic — kill simulated cars in prod

## Physical iPhone gate

Checklist in `docs/OPERATOR_UX_IPHONE_GATE.md` — **INCOMPLETE until owner device pass.**

## Acceptance for this first slice (UX-1 chrome)

- [ ] Compact logo; no always-visible KEYS pill on globe
- [ ] Command bar collapsed to ASK EARTH EYE; expands on demand
- [ ] Tabs: GLOBE | TRACK | CAMERAS | ANALYST | MORE
- [ ] GLOBE opens layers drawer
- [ ] MORE grouped; NORTH/TILT floating (not in MORE grid)
- [ ] Sheet height modes peek/half/full wired
- [ ] Analyst AI-off one-line strip
- [ ] TRACK panel scaffold with live-ish counts when layers loaded
- [ ] Tests green; deploy; no push; AO-0 still OFF
