# Milestone — iPhone city-scale sharpness (keyless Esri path)

Date: 2026-09-29 ~4:20 AM CT  
**Physical iPhone gate:** still INCOMPLETE

## Live production path (verified)
`fly secrets list -a eartheye` has **no** `CESIUM_ION_TOKEN` / `GOOGLE_MAPS_API_KEY`.  
Those are **Vite build-time** browser keys (see Dockerfile). Without `--build-secret` at deploy, the bundle is keyless:

| Stack | Live? |
|-------|-------|
| Google Photorealistic 3D Tiles | **No** |
| Bing Aerial (ion) | **No** |
| Esri World Imagery (keyless) | **Yes — default** |
| OSM roads | Fallback only |

No service-worker cache issue (`cache-control: no-store`). v39 SSE/DPR tweak was necessary but not sufficient.

## Root cause (deeper than v39)
1. **Keyless Esri only** — no Photoreal mesh; city view is 2D draped satellite.
2. **ArcGIS MapServer provider + low SSE budget / DPR crush** → coarse parents **upsampled** into giant green/beige pixels (Capitol mosaic).
3. **tileFailureFallback threshold=2** → flaky Safari could dump to **OSM street** (wrong basemap for aerial expectations).
4. Apple Maps flyover uses **proprietary 3D mesh** — EE cannot match that without Google Photoreal / similar.

## Fix shipped (quality-first)
1. `createEsriImagery` → `UrlTemplateImageryProvider` with **maximumLevel 19** (explicit city LOD).
2. Mobile GPU: **resolutionScale = 1** (DPR crush A/B off); SSE **1.25**; tileCache **150**; loadingDescendantLimit **48**; preloadSiblings.
3. Esri→OSM fallback threshold **2 → 16** (stay on aerial longer).
4. Docs: exact secrets owner must supply (no tokens invented).

## Apple gap (honest)
| Apple Maps | Earth Eye (keyless) |
|------------|---------------------|
| Photorealistic 3D mesh / flyover | Flat Esri satellite on ellipsoid/Re:Earth terrain |
| Proprietary tile/mesh pipeline | Public Esri World Imagery z≤19 |
| — | With build secrets: Google Photoreal 3D via ion or Maps key |

## CONFIGURATION REQUIRED (owner — do not invent)
Browser keys are inlined at **image build**, not runtime `fly secrets set`:

```bash
# Cesium ion token → Bing aerial + Google 3D via ion asset 2275207 + world terrain
fly deploy -a eartheye --ha=false \
  --build-secret CESIUM_ION_TOKEN='<owner ion token>'

# AND/OR Google Map Tiles API key (referrer-restricted) → direct Photoreal 3D
fly deploy -a eartheye --ha=false \
  --build-secret GOOGLE_MAPS_API_KEY='<owner Maps key>'
```

Optional both. Runtime secrets (TOMTOM, LOGIN_*, SESSION_SECRET) stay as today.

## Tests
`mobileGpuProfile` + `imagery.esri` + `controller` + `sourceFactories` — 38 pass

## SHA / Fly
- SHA: `8f96a62`
- Fly: **v40** `registry.fly.io/eartheye:deployment-01M3P79G8X52WGH2JNRMNHAFJW`
