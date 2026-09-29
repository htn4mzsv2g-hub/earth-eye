/**
 * Dev-only build flag for excluded or fictional features.
 *
 * Earth Eye keeps some upstream code (ALPR layer, simulated traffic, the
 * TR-3B aircraft, launch replay / reconstructed ascent tracks) only so it can
 * be studied during development. None of it may reach a user in the
 * production build:
 *
 * - `vite build` sets `import.meta.env.PROD === true`, and this function then
 *   always returns false. No environment variable, URL, storage key or
 *   console global can turn it back on.
 * - In `vite` dev mode it is still off unless the developer starts the dev
 *   server with `VITE_EE_DEV_EXCLUDED=1`.
 * - Under the Node unit-test harness (no Vite env) it is off unless a test
 *   sets `globalThis.__EE_DEV_EXCLUDED__ = true` explicitly.
 *
 * Radio/scanner is not covered by this flag: it is blocked by the source
 * registry (review 'blocked') in every build.
 */

/** Feature ids that exist only behind the dev flag. */
export const DEV_ONLY_FEATURES = Object.freeze([
  'alpr-cameras',
  'traffic',
  'tr3b',
  'launch-replay',
  'reconstructed-launch-tracks',
]);

/** Layer ids that are excluded from every production control and default. */
export const DEV_ONLY_LAYER_IDS = Object.freeze(['alpr-cameras']);

/** Director scenes that only exist to enable dev-only layers. */
export const DEV_ONLY_SCENE_IDS = Object.freeze([
  'city-overload',
  'omniscience-pullback',
]);

function viteEnv() {
  try {
    return import.meta.env || null;
  } catch {
    return null;
  }
}

/**
 * Whether excluded/fictional features may be enabled in this build.
 * @param {object|null} [env] Injected Vite-style env (tests); defaults to import.meta.env.
 * @returns {boolean}
 */
export function devExcludedFeaturesEnabled(env = viteEnv()) {
  if (env && (env.PROD === true || env.MODE === 'production')) return false;
  if (env && env.DEV === true) return env.VITE_EE_DEV_EXCLUDED === '1';
  return globalThis.__EE_DEV_EXCLUDED__ === true;
}

/** True when the layer id is dev-only and the dev flag is off. */
export function isDevOnlyLayerBlocked(layerId, env) {
  return (
    DEV_ONLY_LAYER_IDS.includes(String(layerId || '')) &&
    !devExcludedFeaturesEnabled(env)
  );
}

/** True when the Director scene id is dev-only and the dev flag is off. */
export function isDevOnlySceneBlocked(sceneId, env) {
  return (
    DEV_ONLY_SCENE_IDS.includes(String(sceneId || '')) &&
    !devExcludedFeaturesEnabled(env)
  );
}
