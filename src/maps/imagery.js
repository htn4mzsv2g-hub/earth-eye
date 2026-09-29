import * as Cesium from 'cesium';

// Attribution and service rights are documented in DATA_SOURCES.md.
export const ESRI_ATTRIBUTION_HTML =
  '<a href="https://www.esri.com" target="_blank" rel="noopener">Powered by Esri</a>';

/** Esri World Imagery LOD 0–23; city-scale usable detail tops out ~19 for most areas. */
export const ESRI_WORLD_IMAGERY_MAX_LEVEL = 19;

/**
 * Direct tiled World Imagery URL (z/y/x). Prefer this over ArcGIS MapServer
 * metadata on mobile: avoids DiscardMissingTileImagePolicy false-misses and
 * forces an explicit maximumLevel so city zoom refines instead of upsampling
 * coarse parents into a mosaic.
 */
export const ESRI_WORLD_IMAGERY_TILE_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export function createOsmImagery() {
  return new Cesium.OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/',
    credit: '© OpenStreetMap contributors',
  });
}

/**
 * Keyless Esri World Imagery for the globe stack.
 * Returns a Promise when the ArcGIS metadata path is used; UrlTemplate is sync
 * but wrapped so callers can always await.
 */
export function createEsriImagery() {
  // UrlTemplate + explicit max level: city-scale sharpness without ion/Google.
  // Cannot match Apple Photorealistic mesh/flyover — that needs proprietary 3D.
  return Promise.resolve(
    new Cesium.UrlTemplateImageryProvider({
      url: ESRI_WORLD_IMAGERY_TILE_URL,
      maximumLevel: ESRI_WORLD_IMAGERY_MAX_LEVEL,
      credit:
        'Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    }),
  );
}

/** Legacy ArcGIS MapServer factory (tests / recovery). Prefer createEsriImagery. */
export function createEsriImageryViaMapServer() {
  return Cesium.ArcGisMapServerImageryProvider.fromUrl(
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    {
      credit:
        'Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      enablePickFeatures: false,
      maximumLevel: ESRI_WORLD_IMAGERY_MAX_LEVEL,
    },
  );
}

export function createIonImagery(style, accessToken) {
  accessToken = String(accessToken || '').trim();
  if (!accessToken) throw new Error('Ion imagery requires an explicit token');
  return Cesium.IonImageryProvider.fromAssetId(style, { accessToken });
}
