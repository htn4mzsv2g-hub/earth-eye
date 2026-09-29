/**
 * Authoritative Earth Eye selection — independent of Cesium.
 *
 * Events / cameras / places / tracking / globe publish into one contract.
 * Analyst, CAMERAS, TRACK, and MORE read the same identity. Synthetic carriers
 * never require a live Cesium entity (non-3D / audit mode safe).
 *
 * Closing the camera viewer: default RETAIN (selection stays). Explicit CLEAR
 * is available via clearSharedSelection / clearPolicy:'clear'.
 */

import {
  getContextStore,
  registerEntityContext,
  selectEntityContext,
  getSelectedEntityContext,
} from '../data/contextStore.js';
import { earthEyeIdentity } from './analystIdentity.js';

export const VIEWER_CLOSE_POLICY = Object.freeze({
  RETAIN: 'retain',
  CLEAR: 'clear',
});

/** Default when the shared CAMERAS viewer closes. */
export const DEFAULT_VIEWER_CLOSE_POLICY = VIEWER_CLOSE_POLICY.RETAIN;

const PLACE_LAYER = 'place';
const CCTV_LAYER = 'cctv';

function syntheticCarrier(id) {
  return { __gevContextId: String(id), __eeSynthetic: true, show: true };
}

/**
 * Publish any Earth Eye subject into the shared selection slot.
 * Does not require a Cesium entity.
 * @param {object} meta
 * @param {{ entity?: object }} [opts]
 */
export function setSharedSelection(meta, opts = {}) {
  if (!meta?.id) return null;
  const id = String(meta.id);
  const carrier = opts.entity || syntheticCarrier(id);
  const record = registerEntityContext(carrier, {
    ...meta,
    id,
    layerId: meta.layerId || meta.type || null,
    latitude: meta.latitude ?? meta.lat ?? null,
    longitude: meta.longitude ?? meta.lon ?? meta.lng ?? null,
  });
  if (!record) return null;
  selectEntityContext(carrier);
  return record;
}

/** Select a geocoded / quick place (coords become the nearby query anchor). */
export function selectPlace({ label, lat, lon, id, source } = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)))
    return null;
  const placeId = String(id || `place:${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`);
  return setSharedSelection({
    id: placeId,
    layerId: PLACE_LAYER,
    type: PLACE_LAYER,
    providerId: placeId,
    label: String(label || placeId).slice(0, 160),
    provider: source || 'place',
    source: source || 'place',
    latitude: Number(lat),
    longitude: Number(lon),
    properties: { eventType: 'place', kind: 'place' },
  });
}

/** Select a camera catalog row; opens viewer separately. */
export function selectCamera({ id, label, lat, lon, provider, source } = {}) {
  if (!id) return null;
  const camId = String(id);
  return setSharedSelection({
    id: camId,
    layerId: CCTV_LAYER,
    type: CCTV_LAYER,
    providerId: camId,
    label: String(label || camId).slice(0, 160),
    provider: provider || source || 'camera catalog',
    source: provider || source || 'camera catalog',
    latitude: Number.isFinite(Number(lat)) ? Number(lat) : null,
    longitude: Number.isFinite(Number(lon)) ? Number(lon) : null,
    properties: { eventType: 'cctv', kind: 'cctv' },
  });
}

/**
 * Read the shared selection as Earth Eye identity (Analyst / “What is this?”).
 * @param {{ dataManager?: object }} [opts]
 */
export function readSharedIdentity(opts = {}) {
  try {
    const rec = getSelectedEntityContext(opts);
    return earthEyeIdentity(rec);
  } catch {
    return null;
  }
}

/**
 * Read selected lat/lon for nearby queries (place / entity / camera).
 * Never invents a location; never uses “in view” without a real viewport.
 */
export function readSharedLocation(opts = {}) {
  try {
    const rec = getSelectedEntityContext(opts);
    if (!rec) return null;
    const lat = Number(
      rec.latitude ?? rec.lat ?? rec.position?.latitude ?? rec.position?.lat,
    );
    const lon = Number(
      rec.longitude ??
        rec.lon ??
        rec.lng ??
        rec.position?.longitude ??
        rec.position?.lon,
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat,
      lon,
      source: 'selected',
      id: rec.id || null,
      layerId: rec.layerId || null,
      label: rec.label || null,
    };
  } catch {
    return null;
  }
}

/** Explicit clear of the shared selection slot. */
export function clearSharedSelection({ reason = 'deliberate' } = {}) {
  const store = getContextStore();
  const prev = store.selectedEntityId;
  store.selectedEntityId = null;
  store.selectedAt = null;
  try {
    if (typeof window !== 'undefined' && prev) {
      const EventCtor =
        typeof window.CustomEvent === 'function'
          ? window.CustomEvent
          : typeof CustomEvent === 'function'
            ? CustomEvent
            : null;
      if (EventCtor) {
        window.dispatchEvent(
          new EventCtor('gev:entity-selection-cleared', {
            detail: { reason, policy: VIEWER_CLOSE_POLICY.CLEAR },
          }),
        );
      }
    }
  } catch {
    /* */
  }
  return true;
}

/**
 * Apply camera-viewer close policy.
 * @param {'retain'|'clear'} [policy]
 */
export function onCameraViewerClosed(
  policy = DEFAULT_VIEWER_CLOSE_POLICY,
) {
  if (policy === VIEWER_CLOSE_POLICY.CLEAR) {
    const id = getContextStore().selectedEntityId;
    const rec = id ? getContextStore().entities.get(id) : null;
    if (rec?.layerId === CCTV_LAYER) clearSharedSelection({ reason: 'viewer-close' });
    return VIEWER_CLOSE_POLICY.CLEAR;
  }
  // RETAIN: selection identity stays so Analyst / nearby keep the same object.
  return VIEWER_CLOSE_POLICY.RETAIN;
}

export {
  PLACE_LAYER as SHARED_PLACE_LAYER,
  CCTV_LAYER as SHARED_CCTV_LAYER,
};
