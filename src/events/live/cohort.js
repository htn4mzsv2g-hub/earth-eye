/**
 * EE-EVENTS-2 — Bounded globe marker cohort (pure).
 *
 * Progressive detail: not every global record at once.
 * Precision honesty: region/unknown never get invented points.
 * Polygon/bbox may use a source-geometry representative center only.
 */

import { isImpreciseGeography, precisionAllowsPoint } from '../worldEventContract.js';
import { kindShortLabel, sourceIdFromEvent, tierFromEvent } from './filters.js';

export const WORLD_EVENTS_OVERLAY_SOURCE_ID = 'world-events';
export const WORLD_EVENTS_MARKER_COHORT_LIMIT = 64;
export const WORLD_EVENTS_OVERLAY_COLLISION_CAPACITY = 48;

/** Kind priority for progressive selection (quality > count). */
const KIND_PRIORITY = Object.freeze({
  'OFFICIAL ALERT': 6000,
  'OFFICIAL REPORT': 5500,
  'HUMANITARIAN REPORT': 4000,
  'PUBLIC DATA OBSERVATION': 3500,
  'NEWS REPORT': 1000,
  'EARTH EYE ANALYSIS': 500,
});

/**
 * Extract a source-provided lon/lat suitable for a marker.
 * Returns null when geography is imprecise or coords absent — never invents.
 * @param {object} event
 * @returns {{lon:number, lat:number, anchor:'point'|'extent-center'}|null}
 */
export function markerAnchorFromEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const precision = event.precision || 'unknown';
  if (isImpreciseGeography(precision)) return null;

  const g = event.geometry;
  if (!g || typeof g !== 'object') return null;

  if (precisionAllowsPoint(precision) || g.type === 'Point') {
    const lon = Number(g.lon ?? g.coordinates?.[0]);
    const lat = Number(g.lat ?? g.coordinates?.[1]);
    if (
      Number.isFinite(lon) &&
      Number.isFinite(lat) &&
      Math.abs(lon) <= 180 &&
      Math.abs(lat) <= 90
    ) {
      return { lon, lat, anchor: 'point' };
    }
    return null;
  }

  // Source-provided extent → honest representative center (not a city invent).
  if (
    precision === 'polygon' ||
    precision === 'multipolygon' ||
    precision === 'bbox' ||
    g.type === 'Polygon' ||
    g.type === 'MultiPolygon' ||
    g.type === 'BBox'
  ) {
    const center = extentCenter(g);
    if (center) return { ...center, anchor: 'extent-center' };
  }
  return null;
}

function extentCenter(geometry) {
  if (geometry.type === 'BBox' || geometry.bbox) {
    const b = geometry.bbox || geometry.coordinates;
    if (Array.isArray(b) && b.length >= 4) {
      const [w, s, e, n] = b.map(Number);
      if ([w, s, e, n].every(Number.isFinite)) {
        return { lon: (w + e) / 2, lat: (s + n) / 2 };
      }
    }
  }
  const rings = collectRings(geometry);
  if (!rings.length) return null;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let n = 0;
  for (const ring of rings) {
    for (const pt of ring) {
      const lon = Number(pt?.[0]);
      const lat = Number(pt?.[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      n++;
    }
  }
  if (!n || !Number.isFinite(minLon)) return null;
  return { lon: (minLon + maxLon) / 2, lat: (minLat + maxLat) / 2 };
}

function collectRings(geometry) {
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    const out = [];
    for (const poly of geometry.coordinates) {
      if (Array.isArray(poly)) out.push(...poly);
    }
    return out;
  }
  return [];
}

function eventPriority(event) {
  const kindBoost = KIND_PRIORITY[event.kind] || 0;
  const sev = event.severity?.value;
  let sevBoost = 0;
  if (typeof sev === 'number' && Number.isFinite(sev)) sevBoost = sev * 100;
  else if (typeof sev === 'string') {
    const s = sev.toLowerCase();
    if (s.includes('extreme') || s.includes('red')) sevBoost = 400;
    else if (s.includes('severe') || s.includes('orange')) sevBoost = 250;
    else if (s.includes('moderate') || s.includes('yellow')) sevBoost = 100;
  }
  const t = Date.parse(event.eventTime?.start || event.lastUpdated || '') || 0;
  // Newer events slightly preferred within same kind/severity.
  const timeBoost = Math.min(999, Math.floor(t / 1e10));
  return kindBoost + sevBoost + timeBoost;
}

/**
 * Select a performance-bounded marker cohort from filtered events.
 * @param {object[]} events - Already kind/tier/source filtered.
 * @param {{limit?: number}} [opts]
 * @returns {Array<{event:object, lon:number, lat:number, anchor:string, priority:number, title:string, kindLabel:string, sourceId:string|null, tier:string|null}>}
 */
export function selectMarkerCohort(
  events,
  { limit = WORLD_EVENTS_MARKER_COHORT_LIMIT } = {},
) {
  const cap = Math.max(
    0,
    Math.min(
      WORLD_EVENTS_MARKER_COHORT_LIMIT,
      Math.floor(Number(limit) || WORLD_EVENTS_MARKER_COHORT_LIMIT),
    ),
  );
  if (!Array.isArray(events) || cap === 0) return [];

  const candidates = [];
  for (const event of events) {
    const anchor = markerAnchorFromEvent(event);
    if (!anchor) continue;
    candidates.push({
      event,
      lon: anchor.lon,
      lat: anchor.lat,
      anchor: anchor.anchor,
      priority: eventPriority(event),
      title: String(event.title || event.eventId || 'Event').slice(0, 80),
      kindLabel: kindShortLabel(event.kind),
      sourceId: sourceIdFromEvent(event),
      tier: tierFromEvent(event),
    });
  }

  candidates.sort(
    (a, b) =>
      b.priority - a.priority ||
      String(a.event.eventId).localeCompare(String(b.event.eventId)),
  );
  return candidates.slice(0, cap);
}

/**
 * Build a world-overlay label entry for one cohort row (no Cesium types).
 * Caller attaches Cartesian3 position.
 */
export function createWorldEventOverlaySpec(row) {
  const id = String(row.event.eventId);
  const kind = row.event.kind;
  const accent =
    kind === 'OFFICIAL ALERT' || kind === 'OFFICIAL REPORT'
      ? '#f59e0b'
      : kind === 'NEWS REPORT'
        ? '#94a3b8'
        : kind === 'HUMANITARIAN REPORT'
          ? '#38bdf8'
          : '#34d399';
  return {
    id,
    variant: 'label',
    title: `${row.kindLabel}`,
    subtitle: row.title.slice(0, 40),
    accent,
    priority: row.priority,
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    interactive: true,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: 14,
    verticalOnly: true,
    placement: 'above',
  };
}

/**
 * Count how many filtered events are list-only (no honest marker).
 */
export function countListOnly(events) {
  if (!Array.isArray(events)) return 0;
  let n = 0;
  for (const ev of events) {
    if (!markerAnchorFromEvent(ev)) n++;
  }
  return n;
}
