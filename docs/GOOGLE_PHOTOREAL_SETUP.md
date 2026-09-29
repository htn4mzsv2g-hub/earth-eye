**Owner checklist (Path A):** [`GOOGLE_PHOTOREAL_OWNER_STEPS.md`](./GOOGLE_PHOTOREAL_OWNER_STEPS.md)

# Google Photorealistic 3D — Earth Eye setup (CesiumJS / GEV baseline)

**Status:** Code path ready. **Billable Google/ion traffic OFF** until owner supplies keys and explicitly approves.  
**Do not invent keys. Do not paste keys in chat.** Use Provider Settings (dev POWER UP) or Fly **build** secrets when owner says keys are ready.

CesiumJS stays the engine. No Mapbox. No architecture rewrite.

## Stack order (fixed)

| Priority | Stack | Credential | When |
|----------|-------|------------|------|
| 1 | **Google Photorealistic 3D** (direct) | `GOOGLE_MAPS_API_KEY` | Map Tiles API + billing |
| 2 | **Ion-hosted Google 3D** | `CESIUM_ION_TOKEN` | Ion token with asset **2275207** |
| 3 | **Esri World Imagery** + keyless/world terrain | none / ion for world terrain | **Default today (keyless)** |
| 4 | **OSM** roads | none | Final imagery fallback only |

No silent OSM when Google is off — Esri is the keyless globe. Downgrades surface an honest reason (`window.__eePhotorealStatus` + map chip `unavailableReason` + Keys unlock text).

## Credential paths Earth Eye already supports

### A) Direct Google Photorealistic 3D (preferred when keyed)
1. Google Cloud Console → enable **Map Tiles API** (and Places if you use place search).
2. Create an API key; restrict by **HTTP referrer** to `https://eartheye.us/*`, `https://eartheye.fly.dev/*`, and local dev origins as needed.
3. Set env `GOOGLE_MAPS_API_KEY` (see install methods below).
4. Cesium loads via `Cesium.createGooglePhotorealistic3DTileset({ key })`.

### B) Cesium ion–hosted Google 3D
1. Create a token at [ion.cesium.com/tokens](https://ion.cesium.com/tokens).
2. Ensure the token can access Google Photorealistic 3D Tiles (ion asset **2275207**).
3. Set env `CESIUM_ION_TOKEN`.
4. Also unlocks Bing aerial/labels + Cesium World Terrain when selected.

### C) Keyless (current production)
No Google/ion browser keys in the Vite bundle → **Esri + Re:Earth/ellipsoid terrain**. Google Photoreal remains OFF (not billable).

## How to install keys (owner only — when approved)

Browser keys are inlined at **image build** (`import.meta.env`), not via runtime `fly secrets set` alone.

### Local / Pinokio / `npm run dev`
1. Open in-app **KEYS / POWER UP** (Provider Settings).
2. Paste **GOOGLE MAPS** and/or **CESIUM ION** (never commit `.env`).
3. Save → app restarts and reloads with the new bundle env.

### Fly production (build secrets)
```bash
# When owner has approved billable Google/ion and has keys ready:
fly deploy -a eartheye --ha=false \
  --build-secret GOOGLE_MAPS_API_KEY='…' \
  --build-secret CESIUM_ION_TOKEN='…'
```
Either secret alone is enough to attempt Photoreal (direct preferred if both present).

**Do not** run the above until owner says keys are ready and billable use is approved.

## Honest status surfaces
- Map stack chip: Google 3D unavailable reason (needs key vs configured-but-failed).
- Keys panel unlock lines: Google = metered Photoreal; Ion = Photoreal via ion + Bing + terrain.
- `window.__eePhotorealStatus` after boot: `{ active, route, fallbackStackId, reason, billable }`.

## What this is not
- Not Apple Maps mesh/flyover parity.
- Not an Esri “make it look Photoreal” project.
- Not enabling spend without owner approval.
