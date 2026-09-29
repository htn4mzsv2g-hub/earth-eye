/**
 * Earth Eye layer enable policy: the one function the layer manager asks
 * before ANY layer is turned on (src/data/lifecycle.js `enablePolicy`).
 *
 * It refuses, with a plain reason:
 *   - locked-policy exclusions: ALPR, simulated traffic (dev-only build flag,
 *     never in production); radio/COMMS is pending per-provider (not blanket excluded);
 *   - sources pending permission review or switched off by the operator;
 *   - restricted datasets while commercial-safe mode is on.
 * Layers the registry has never audited are upstream internals and pass.
 */
import {
  disabledReason,
  onCommercialSafeChange,
  setCommercialSafeMode,
} from './dataSourceRegistry.js';

/** @returns {string} '' when allowed, otherwise the refusal reason. */
export function atlasEnablePolicy(layerId) {
  return disabledReason(layerId);
}

/**
 * Apply commercial-safe mode from the server (GET /api/atlas/policy) and keep
 * the manager consistent: any restricted layer that is on when the mode turns
 * on is switched off. Resolves to the applied boolean.
 * @param {object} dataManager LayerLifecycle
 * @param {{fetchImpl?: typeof fetch}} [o]
 */
export async function applyServerPolicy(dataManager, { fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  // Stays subscribed for the session: a later change re-applies.
  onCommercialSafeChange((on) => {
    if (!on) return;
    for (const layer of dataManager.getAll?.() || []) {
      if (layer.enabled && disabledReason(layer.id))
        void dataManager.setEnabled(layer.id, false, { origin: 'policy' });
    }
  });
  try {
    const r = await doFetch('/api/atlas/policy', { cache: 'no-store' });
    if (!r.ok) return false;
    const body = await r.json();
    setCommercialSafeMode(body?.commercialSafe === true);
    return body?.commercialSafe === true;
  } catch {
    // Unreachable policy endpoint: keep the default (off). Earth Eye is a
    // private non-commercial instance; the server still enforces its side.
    return false;
  }
}
