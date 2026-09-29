# Map build secrets (browser keys)

Earth Eye inlines map browser keys at **Vite build** (`import.meta.env.*`).  
Runtime `fly secrets set` does **not** enable Google 3D / Bing / ion terrain.

| Secret | Purpose | How to pass |
|--------|---------|-------------|
| `CESIUM_ION_TOKEN` | Ion Bing aerial/labels, Google 3D via ion, Cesium World Terrain | `fly deploy --build-secret CESIUM_ION_TOKEN=...` |
| `GOOGLE_MAPS_API_KEY` | Direct Google Photorealistic 3D Tiles | `fly deploy --build-secret GOOGLE_MAPS_API_KEY=...` |

Without either: **keyless Esri World Imagery** + Re:Earth/ellipsoid terrain.

Do not commit tokens. Do not invent tokens.

See also: `docs/GOOGLE_PHOTOREAL_SETUP.md` (stack order, Google Cloud / ion steps, Keys UI).
Billable Google stays OFF until owner approves and supplies keys.
