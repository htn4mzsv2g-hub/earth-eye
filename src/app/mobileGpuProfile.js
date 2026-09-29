/**
 * Mobile GPU profile for Cesium viewer creation.
 *
 * History:
 * - Wave 3–4 crushed quality: resolutionScale≈1.75/dpr (~0.58@3×) + SSE≥4 +
 *   tileCache≤64 → mosaic globe (owner iPhone screenshots).
 * - v39 raised scale floor to 0.9 / SSE 2 / cache 100 — still soft vs Apple.
 * - This pass (quality-first, keyless Esri): resolutionScale=1 (no DPR crush),
 *   SSE 1.25, larger tile cache + loadingDescendantLimit so city zoom refines
 *   instead of upsampling coarse parents.
 *
 * FPS levers kept: MSAA 1×, targetFrameRate 30 on compact.
 * Apple Photorealistic mesh/flyover cannot be matched without proprietary 3D
 * (needs GOOGLE_MAPS_API_KEY or CESIUM_ION_TOKEN at *build* time).
 */

/**
 * @param {number} dpr
 * @returns {number} Always 1 — DPR crush caused mosaic; A/B disables it.
 */
export function resolveMobileResolutionScale(dpr) {
  void dpr;
  return 1;
}

/**
 * @param {{
 *   matchMedia?: ((q: string) => { matches: boolean }) | null,
 *   maxTouchPoints?: number,
 *   devicePixelRatio?: number,
 *   innerWidth?: number,
 * }} [env]
 */
export function resolveMobileGpuProfile(env = {}) {
  const matchMedia =
    typeof env.matchMedia === 'function'
      ? env.matchMedia
      : typeof globalThis.matchMedia === 'function'
        ? globalThis.matchMedia.bind(globalThis)
        : null;
  const maxTouchPoints = Number.isFinite(env.maxTouchPoints)
    ? env.maxTouchPoints
    : Number(globalThis.navigator?.maxTouchPoints) || 0;
  const dpr = Number.isFinite(env.devicePixelRatio)
    ? env.devicePixelRatio
    : Number(globalThis.devicePixelRatio) || 1;
  const width = Number.isFinite(env.innerWidth)
    ? env.innerWidth
    : Number(globalThis.innerWidth) || 1024;

  const coarse =
    Boolean(matchMedia?.('(pointer: coarse)')?.matches) || maxTouchPoints > 0;
  const narrow = width > 0 && width <= 900;
  const compact = coarse || narrow;

  if (!compact) {
    return Object.freeze({
      compact: false,
      msaaSamples: 4,
      targetFrameRate: 60,
      resolutionScale: 1,
      reason: 'desktop-default',
    });
  }

  return Object.freeze({
    compact: true,
    msaaSamples: 1,
    targetFrameRate: 30,
    resolutionScale: resolveMobileResolutionScale(dpr),
    reason: coarse && narrow ? 'coarse+narrow' : coarse ? 'coarse' : 'narrow',
  });
}

/** Below Cesium default (2) so imagery refines at city scale on phone. */
export const MOBILE_MAX_SCREEN_SPACE_ERROR = 1.25;
export const MOBILE_TILE_CACHE_SIZE = 150;
/** Default Cesium is 20 — raise so descendants load instead of parent upsample. */
export const MOBILE_LOADING_DESCENDANT_LIMIT = 48;

/**
 * Apply Cesium scene knobs after viewer construction.
 * @param {object} viewer Cesium.Viewer
 * @param {ReturnType<typeof resolveMobileGpuProfile>} [profile]
 */
export function applyMobileGpuTuning(
  viewer,
  profile = resolveMobileGpuProfile(),
) {
  const scene = viewer?.scene;
  const globe = scene?.globe;
  if (!scene || !globe || !profile?.compact) {
    return { applied: false, reason: profile?.reason || 'no-viewer' };
  }
  globe.maximumScreenSpaceError = MOBILE_MAX_SCREEN_SPACE_ERROR;
  if (typeof globe.tileCacheSize === 'number') {
    globe.tileCacheSize = MOBILE_TILE_CACHE_SIZE;
  }
  if (typeof globe.loadingDescendantLimit === 'number') {
    globe.loadingDescendantLimit = MOBILE_LOADING_DESCENDANT_LIMIT;
  }
  if ('preloadSiblings' in globe) globe.preloadSiblings = true;
  // Full backing store — do not assign resolutionScale < 1.
  if (
    viewer &&
    typeof viewer.resolutionScale === 'number' &&
    viewer.resolutionScale < 1
  ) {
    viewer.resolutionScale = 1;
  }
  return {
    applied: true,
    reason: profile.reason,
    maximumScreenSpaceError: globe.maximumScreenSpaceError,
    tileCacheSize: globe.tileCacheSize ?? null,
    loadingDescendantLimit: globe.loadingDescendantLimit ?? null,
    resolutionScale: profile.resolutionScale,
  };
}
