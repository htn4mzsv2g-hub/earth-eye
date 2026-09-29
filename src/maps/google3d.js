const clean = (value) => String(value || '').trim();

/**
 * Premium globe attempt order (GEV / Cesium baseline — do not replace Cesium):
 * 1. Google Photorealistic 3D (direct Map Tiles key)
 * 2. Cesium ion–hosted Google 3D (asset 2275207)
 * 3. Esri World Imagery + keyless/world terrain (keyless default today)
 * 4. OSM roads (final imagery fallback only)
 *
 * Billable Google/ion traffic must NOT start until owner supplies keys and
 * approves. Empty credentials → route `none` (caller activates Esri).
 */
export const GLOBE_STACK_PRIORITY = Object.freeze([
  'google-direct',
  'google-ion',
  'esri-imagery',
  'osm',
]);

/** Ion asset id for Google Photorealistic 3D Tiles (Cesium ion catalog). */
export const GOOGLE_PHOTOREAL_ION_ASSET_ID = 2275207;

/**
 * Decide which photoreal provider to try first.
 * @returns {'google-direct'|'google-ion'|'none'}
 */
export function selectMapStartupRoute({
  googleApiKey = '',
  cesiumToken = '',
} = {}) {
  if (clean(googleApiKey)) return 'google-direct';
  if (clean(cesiumToken)) return 'google-ion';
  return 'none';
}

/**
 * Honest status for Keys / map chips when Google 3D is not active.
 * @param {{
 *   googleApiKey?: string,
 *   cesiumToken?: string,
 *   tileset?: object|null,
 *   route?: string,
 *   errors?: Error[],
 * }} [input]
 */
export function describePhotorealStatus({
  googleApiKey = '',
  cesiumToken = '',
  tileset = null,
  route = '',
  errors = [],
} = {}) {
  const hasGoogle = Boolean(clean(googleApiKey));
  const hasIon = Boolean(clean(cesiumToken));
  if (tileset) {
    const via =
      route === 'google-direct'
        ? 'Google Map Tiles (direct)'
        : route === 'google-ion'
          ? 'Cesium ion–hosted Google 3D'
          : route || 'Google 3D';
    return {
      active: true,
      route: route || 'google-direct',
      fallbackStackId: null,
      reason: `Google Photorealistic 3D active via ${via}`,
      billable: true,
    };
  }
  if (!hasGoogle && !hasIon) {
    return {
      active: false,
      route: 'none',
      fallbackStackId: 'esri-imagery',
      reason:
        'Google Photorealistic 3D OFF — add GOOGLE_MAPS_API_KEY (Map Tiles) and/or CESIUM_ION_TOKEN in Provider Settings / build secrets. Showing Esri satellite (keyless).',
      billable: false,
    };
  }
  const detail =
    errors?.[0]?.message ||
    errors?.[0] ||
    'tileset failed (restrictions, quota, or network)';
  return {
    active: false,
    route: 'none',
    fallbackStackId: 'esri-imagery',
    reason: `Google 3D configured but unavailable (${detail}). Showing Esri satellite. Check Map Tiles API enablement, referrer restrictions, ion token, or quota.`,
    billable: false,
  };
}

/**
 * Load Google Photorealistic 3D Tiles: direct Google first, then ion-hosted.
 * Does not invent keys. With no credentials, returns immediately (Google OFF).
 *
 * @returns {Promise<{tileset: object|null, route: 'google-direct'|'google-ion'|'none', errors: Error[], status: object}>}
 */
export async function loadPhotorealisticTileset(
  Cesium,
  { googleApiKey = '', cesiumToken = '' } = {},
) {
  const googleKey = clean(googleApiKey);
  const ionToken = clean(cesiumToken);
  const errors = [];

  const attempts = [];
  if (googleKey) attempts.push({ route: 'google-direct', googleKey });
  if (ionToken) attempts.push({ route: 'google-ion', googleKey: undefined });

  for (const attempt of attempts) {
    try {
      const tileset = attempt.googleKey
        ? await createGoogleDirectTileset(Cesium, attempt.googleKey)
        : await createGoogleIonTileset(Cesium, ionToken);
      const status = describePhotorealStatus({
        googleApiKey,
        cesiumToken,
        tileset,
        route: attempt.route,
      });
      return { tileset, route: attempt.route, errors, status };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  const route = 'none';
  const status = describePhotorealStatus({
    googleApiKey,
    cesiumToken,
    tileset: null,
    route,
    errors,
  });
  return { tileset: null, route, errors, status };
}

/** Pass credentials to the source instead of changing SDK-wide defaults. */
export function createGoogleDirectTileset(Cesium, key) {
  key = clean(key);
  if (!key) throw new Error('Google 3D requires an explicit browser key');
  return Cesium.createGooglePhotorealistic3DTileset(
    { key, onlyUsingWithGoogleGeocoder: true },
    { asynchronouslyLoadImagery: true },
  );
}

export async function createGoogleIonTileset(
  Cesium,
  accessToken,
  { signal } = {},
) {
  accessToken = clean(accessToken);
  if (!accessToken)
    throw new Error('Google 3D through ion requires an explicit token');
  signal?.throwIfAborted();
  const resource = await Cesium.IonResource.fromAssetId(
    GOOGLE_PHOTOREAL_ION_ASSET_ID,
    { accessToken },
  );
  signal?.throwIfAborted();
  return Cesium.Cesium3DTileset.fromUrl(resource, {
    cacheBytes: 1536 * 1024 * 1024,
    maximumCacheOverflowBytes: 1024 * 1024 * 1024,
    enableCollision: true,
    asynchronouslyLoadImagery: true,
  });
}
