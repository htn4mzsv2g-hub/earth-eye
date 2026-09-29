# Milestone — iPhone globe sharpness (P0 mosaic fix)

Date: 2026-09-29 ~4:10 AM CT (America/Chicago)  
**Physical iPhone gate:** still INCOMPLETE (owner re-check after deploy)

## Root cause
Perf waves 3–4 in `src/app/mobileGpuProfile.js` over-corrected fill-rate:

| Knob | Wave 3–4 (broken) | Effect on 3× iPhone |
|------|-------------------|---------------------|
| `resolutionScale` | `min(1, 1.75/dpr)` → **~0.58** | Backing store ~⅓ of pixels → huge soft blocks |
| `globe.maximumScreenSpaceError` | forced **≥ 4** (Cesium default ~2) | Coarse terrain/imagery LOD → green/beige squares |
| `globe.tileCacheSize` | capped **≤ 64** | Tile starvation under pan/zoom |

Owner Safari screenshot of eartheye.us matched this exactly (mosaic globe, little chrome).

## Fix (quality-first; keep FPS levers)
1. `resolveMobileResolutionScale(dpr)` — soft-cap ~2.7× effective DPR, **floor 0.9** (3× → **0.9**, was 0.58; 2× → 1.0)
2. `MOBILE_MAX_SCREEN_SPACE_ERROR = 2` (no longer force ≥4)
3. `MOBILE_TILE_CACHE_SIZE = 100` (near Cesium default; no ≤64 crush)
4. Still: MSAA 1×, targetFrameRate 30 on compact (FPS-reasonable)

### Measure (unit)
- Before formula @ dpr=3: `1.75/3 ≈ 0.583`
- After: `max(0.9, 2.7/3) = 0.9` (~**55% more** linear resolution / ~**2.4×** pixel area vs crush)
- SSE 4 → 2; tileCache 64 → 100

## Constraints
No push. No OpenAI/OAuth invent. AUTH untouched. Option C / Broadcastify HELD.

## Tests
`node --test src/app/mobileGpuProfile.test.mjs` — 6 pass

## SHA / release
- Branch: `stage5-incident-workspaces`
- SHA: `db5595c`
- Fly: **v39** `registry.fly.io/eartheye:deployment-01M3P6WSAY7TBVM9V4VAPZ9C44`
