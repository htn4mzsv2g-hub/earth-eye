/**
 * EE-EVENTS-3 — Related conditions (pure).
 * Labeled RELATED — never CAUSED BY / never false causation.
 * Cameras: non-3D-safe ranking (selected place / radius). Never fake IN VIEW
 * without a real viewport bounds object.
 */

import {
  distanceKm,
  rankCameras,
  USEFUL_RADIUS_DEFAULT_KM,
} from '../../atlas/cctvCatalog.js';
import { markerAnchorFromEvent } from './cohort.js';
import { RELATED_NOTE } from './detail.js';

export const RELATED_CAMERA_LIMIT = 8;
export const RELATED_LAYER_LIMIT = 5;
export const RELATED_DEFAULT_RADIUS_KM = USEFUL_RADIUS_DEFAULT_KM;

/** Layers we may surface as RELATED when real EE records are supplied. */
export const RELATED_LAYER_KEYS = Object.freeze([
  'weather',
  'alerts',
  'aircraft',
  'fires',
]);

/**
 * Resolve an honest geographic anchor for related ranking.
 * Region/unknown without coords → null (no invented point).
 */
export function relatedAnchorFromEvent(event) {
  const anchor = markerAnchorFromEvent(event);
  if (!anchor) return null;
  if (!Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lon)) return null;
  return { lat: anchor.lat, lon: anchor.lon };
}

/**
 * Rank nearby cameras relative to the selected event place.
 * Pass bounds only when a real viewport exists; otherwise never label IN VIEW.
 *
 * @param {object} event
 * @param {Array<object>} cameras
 * @param {{
 *   radiusKm?: number,
 *   limit?: number,
 *   bounds?: object|null,
 *   viewCenter?: {lat:number,lon:number}|null,
 * }} [opts]
 */
export function relatedCamerasForEvent(event, cameras = [], opts = {}) {
  const selected = relatedAnchorFromEvent(event);
  if (!selected) {
    return Object.freeze({
      available: false,
      reason: 'No plottable place for this event — cannot rank nearby cameras honestly.',
      items: Object.freeze([]),
      radiusKm: null,
      labeledInView: false,
    });
  }
  const radiusKm = Number.isFinite(opts.radiusKm)
    ? opts.radiusKm
    : RELATED_DEFAULT_RADIUS_KM;
  const limit = Math.max(
    1,
    Math.min(RELATED_CAMERA_LIMIT, Math.floor(opts.limit || RELATED_CAMERA_LIMIT)),
  );
  // Non-3D / no viewport: bounds must stay null so _inView is never faked.
  const bounds = opts.bounds && typeof opts.bounds === 'object' ? opts.bounds : null;
  const center =
    opts.viewCenter &&
    Number.isFinite(opts.viewCenter.lat) &&
    Number.isFinite(opts.viewCenter.lon)
      ? opts.viewCenter
      : selected;

  const ranked = rankCameras(cameras || [], {
    center,
    selected,
    bounds,
    usefulKm: radiusKm,
    nearbyOnly: true,
  });

  const items = ranked.slice(0, limit).map((c) => {
    const km = Number.isFinite(c._selectedKm)
      ? c._selectedKm
      : Number.isFinite(c._km)
        ? c._km
        : null;
    // Only surface IN VIEW when bounds were real and rankCameras set the flag.
    const inView = Boolean(bounds) && Boolean(c._inView);
    return Object.freeze({
      id: String(c.id || ''),
      label: String(c.name || c.id || 'Camera'),
      provider: c.provider || null,
      lat: c.lat,
      lon: c.lon,
      distanceKm: Number.isFinite(km) ? Math.round(km * 10) / 10 : null,
      inView,
      causal: false,
      relation: 'RELATED',
    });
  });

  return Object.freeze({
    available: true,
    reason: items.length
      ? null
      : `No public cameras within ${radiusKm} km of the selected place.`,
    items: Object.freeze(items),
    radiusKm,
    labeledInView: Boolean(bounds),
    relation: 'RELATED',
    note: RELATED_NOTE,
  });
}

/**
 * Filter caller-supplied layer rows by radius around the event place.
 * Only includes rows that already exist (real EE data) — never fabricates.
 *
 * @param {object} event
 * @param {Record<string, Array<object>>} layerBags - keys: weather|alerts|aircraft|fires
 * @param {{radiusKm?: number, limit?: number}} [opts]
 */
export function relatedLayersForEvent(event, layerBags = {}, opts = {}) {
  const selected = relatedAnchorFromEvent(event);
  const radiusKm = Number.isFinite(opts.radiusKm)
    ? opts.radiusKm
    : RELATED_DEFAULT_RADIUS_KM;
  const limit = Math.max(
    1,
    Math.min(RELATED_LAYER_LIMIT, Math.floor(opts.limit || RELATED_LAYER_LIMIT)),
  );

  const sections = {};
  for (const key of RELATED_LAYER_KEYS) {
    const rows = Array.isArray(layerBags?.[key]) ? layerBags[key] : [];
    if (!selected) {
      sections[key] = Object.freeze({
        available: false,
        reason: rows.length
          ? 'Event has no plottable place — cannot score proximity.'
          : 'No related EE data loaded for this layer.',
        items: Object.freeze([]),
      });
      continue;
    }
    if (!rows.length) {
      sections[key] = Object.freeze({
        available: false,
        reason: 'No related EE data loaded for this layer.',
        items: Object.freeze([]),
      });
      continue;
    }
    const scored = [];
    for (const row of rows) {
      const lat = Number(row.lat ?? row.latitude);
      const lon = Number(row.lon ?? row.lng ?? row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const km = distanceKm(selected.lat, selected.lon, lat, lon);
      if (!Number.isFinite(km) || km > radiusKm) continue;
      scored.push({
        id: String(row.id || row.eventId || row.icao24 || row.mmsi || ''),
        label: String(
          row.label || row.name || row.callsign || row.place || row.id || key,
        ),
        distanceKm: Math.round(km * 10) / 10,
        detail: row.detail || row.summary || null,
        source: row.source || row.provider || null,
        lat,
        lon,
        causal: false,
        relation: 'RELATED',
      });
    }
    scored.sort((a, b) => a.distanceKm - b.distanceKm);
    const items = scored.slice(0, limit).map((x) => Object.freeze(x));
    sections[key] = Object.freeze({
      available: items.length > 0,
      reason: items.length
        ? null
        : `No ${key} records within ${radiusKm} km (from loaded EE data).`,
      items: Object.freeze(items),
    });
  }
  return Object.freeze({
    ...sections,
    radiusKm,
    relation: 'RELATED',
    note: RELATED_NOTE,
  });
}

/**
 * Assemble the full RELATED conditions block for the detail surface.
 */
export function buildRelatedConditions(event, {
  cameras = [],
  layerBags = {},
  radiusKm = RELATED_DEFAULT_RADIUS_KM,
  bounds = null,
  viewCenter = null,
} = {}) {
  const camerasBlock = relatedCamerasForEvent(event, cameras, {
    radiusKm,
    bounds,
    viewCenter,
  });
  const layersBlock = relatedLayersForEvent(event, layerBags, { radiusKm });
  return Object.freeze({
    relation: 'RELATED',
    note: RELATED_NOTE,
    causalClaim: false,
    cameras: camerasBlock,
    weather: layersBlock.weather,
    alerts: layersBlock.alerts,
    aircraft: layersBlock.aircraft,
    fires: layersBlock.fires,
    radiusKm,
  });
}

/**
 * Map-dependent action availability for detail surface.
 * When renderer is down → UNAVAILABLE with explanation (never fake SUCCESS).
 */
export function mapActionAvailability({
  rendererDown = false,
  hasAnchor = false,
} = {}) {
  if (rendererDown) {
    return Object.freeze({
      showOnGlobe: Object.freeze({
        available: false,
        status: 'UNAVAILABLE',
        reason:
          'UNAVAILABLE — show on globe needs the 3D renderer (Cesium/WebGL down or non-3D mode).',
      }),
      flyTo: Object.freeze({
        available: false,
        status: 'UNAVAILABLE',
        reason:
          'UNAVAILABLE — fly-to needs the 3D globe (renderer unavailable). No camera move ran.',
      }),
    });
  }
  if (!hasAnchor) {
    return Object.freeze({
      showOnGlobe: Object.freeze({
        available: false,
        status: 'UNAVAILABLE',
        reason:
          'UNAVAILABLE — event has no plottable coordinates (imprecise / list-only).',
      }),
      flyTo: Object.freeze({
        available: false,
        status: 'UNAVAILABLE',
        reason:
          'UNAVAILABLE — event has no plottable coordinates (imprecise / list-only).',
      }),
    });
  }
  return Object.freeze({
    showOnGlobe: Object.freeze({
      available: true,
      status: 'AVAILABLE',
      reason: null,
    }),
    flyTo: Object.freeze({
      available: true,
      status: 'AVAILABLE',
      reason: null,
    }),
  });
}
