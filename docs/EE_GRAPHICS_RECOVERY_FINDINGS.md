# EE-GRAPHICS-RECOVERY — Findings (non-3D audit mode)

**Recorded:** 2026-09-29 ~6:35 AM CDT  
**Scope:** Recoverable Cesium/WebGL init failure → production non-3D audit mode.  
**Base tip (rollback):** Fly **v54** `registry.fly.io/eartheye:deployment-01M3PEW4KQQ6ZC1V00HM0C2C8J`

## Finding

Cloud-browser audit: CesiumWidget init failed with “The browser supports WebGL, but initialization failed.” After dismiss + reload, the app stuck on the loading screen with low-contrast error text and no recovery controls. Cause treated as browser-specific (not a server data fault).

## Architecture (isolated; no Cesium rewrite)

| Piece | Role |
| --- | --- |
| `src/app/graphicsRecovery.js` | Detect/wrap WebGL failures; non-3D state; recovery banner; degraded stubs; `?ee_non3d=1` entry |
| `src/app/viewer.js` | Cesium.Viewer constructor failures → `GraphicsInitError` |
| `src/app/scene.js` | Catch graphics fail / forced non-3D → scene stub (`viewer: null`, real `operations`) |
| `src/app/controls.js` / `data.js` / `tools.js` | Boot shell without StyleManager / LayerLifecycle when `graphicsFailed` |
| `src/atlas/console.js` | Null-safe camera/viewport; map actions → UNAVAILABLE; nav / APIs still mount |
| `src/atlas/analystTools.js` | Action-kind tools → UNAVAILABLE when `graphicsFailed` (never fake SUCCESS) |
| `src/main.js` | Safety-net recovery banner if start rejects with graphics error |

Auth, CSP, TLS, LOGIN_* unchanged. Same session gate. No mock Earth observations.

## Deliberate non-3D entry (testing)

Same auth/permissions — **no extra access**:

- URL: `https://eartheye.us/?ee_non3d=1` (after login)
- Or `sessionStorage.setItem('ee:force-non3d','1')` then reload

**Retry 3D** clears the flag and reloads (drops `ee_non3d` query).

## What works vs renderer-dependent

**Works in non-3D (real APIs):** navigation (GLOBE/TRACK/CAMERAS/ANALYST/MORE), Logout/SECURITY, source health / capabilities / provenance, World Events list+filters+disclosure, CCTV catalog search/rank/viewer/links (rank by selected place or user location — never “IN VIEW” without a valid viewport), place search (`/api/geocode`), Analyst deterministic **query** tools on selected object / cameras / health, read-only session.

**UNAVAILABLE (3D renderer required):** fly-to, Follow, Cockpit, globe markers / “show on globe”, Tour, Snapshot, Analyst **map action** tools, display-layer enable on the globe. TRACK nearest / layer Show that need Cesium entities stay honest OFF/UNAVAILABLE without inventing counts.

## EE-EVENTS-2 coexistence

World Events markers soft-fail without viewer; list/filters/disclosure continue from `/api/atlas/world-events`. No conflict with graphics recovery.
