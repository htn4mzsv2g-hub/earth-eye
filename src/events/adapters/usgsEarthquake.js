/**
 * USGS earthquake row → World Event (PUBLIC DATA OBSERVATION).
 * In-memory normalizer only — does not fetch or replace the earthquakes layer.
 */

import { createWorldEvent, qualifyEventId } from '../worldEventContract.js';

export const USGS_ADAPTER_ID = 'usgs-earthquakes';
export const USGS_PROVIDER = 'usgs';
export const USGS_LAYER_ID = 'earthquakes';

/**
 * @param {object} row - From normalizeEarthquakeSnapshot / mapAnalystRecord shape
 *   {stableId|usgsId|id, lon, lat, depthKm|depth, mag|magnitude, place, time|timeMs}
 * @param {{retrievedAt?: string|number}} [context]
 */
export function normalizeUsgsEarthquakeToWorldEvent(row, context = {}) {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.usgsId || row.stableId || row.id || '').trim();
  if (!id) return null;

  const lon = Number(row.lon);
  const lat = Number(row.lat);
  const hasPoint =
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    Math.abs(lon) <= 180 &&
    Math.abs(lat) <= 90;

  // USGS provides instrumented epicenter coordinates → precision point is honest.
  // Place text alone (no coords) stays region — never invent a point from "place".
  let precision;
  let geometry;
  if (hasPoint) {
    precision = 'point';
    const depth = Number(row.depthKm ?? row.depth);
    geometry = {
      type: 'Point',
      lon,
      lat,
      alt: Number.isFinite(depth) ? -Math.abs(depth) * 1000 : undefined,
    };
  } else if (row.place) {
    precision = 'region';
    geometry = { type: 'Region', name: String(row.place) };
  } else {
    precision = 'unknown';
    geometry = null;
  }

  const mag = Number(row.mag ?? row.magnitude);
  const timeMs = Number(row.time ?? row.timeMs);
  const timeIso =
    Number.isFinite(timeMs) && timeMs > 0
      ? new Date(timeMs).toISOString()
      : null;

  return createWorldEvent({
    eventId: qualifyEventId(USGS_PROVIDER, id),
    kind: 'PUBLIC DATA OBSERVATION',
    sources: ['USGS Earthquake Hazards Program'],
    category: 'earthquake',
    title: Number.isFinite(mag)
      ? `M${mag.toFixed(1)}${row.place ? ` — ${row.place}` : ''}`
      : row.place || `Earthquake ${id}`,
    summary: null,
    severity: Number.isFinite(mag)
      ? { scale: 'USGS magnitude', value: mag, label: `M${mag.toFixed(1)}` }
      : null,
    geometry,
    precision,
    eventTime: {
      start: timeIso,
      end: null,
      uncertainty: null,
    },
    firstReported: timeIso,
    lastUpdated: timeIso,
    retrievedAt: context.retrievedAt || null,
    expiry: null,
    revisionState: 'active',
    related: {
      places: row.place
        ? [{ id: `place:${row.place}`, label: String(row.place) }]
        : [],
    },
    coverage: {
      limits:
        'USGS epicenter is an estimated hypocenter location; not a damage footprint.',
      confidence: null,
    },
    attribution: {
      credit: 'U.S. Geological Survey',
      license: 'U.S. public domain',
      sourceLinks: [
        `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(id)}`,
      ],
    },
    layerId: USGS_LAYER_ID,
    props: {
      magnitude: Number.isFinite(mag) ? mag : null,
      depthKm: Number.isFinite(Number(row.depthKm ?? row.depth))
        ? Number(row.depthKm ?? row.depth)
        : null,
      place: row.place ? String(row.place) : null,
    },
  });
}

export const usgsEarthquakeAdapterDescriptor = Object.freeze({
  id: USGS_ADAPTER_ID,
  label: 'USGS earthquakes',
  provider: USGS_PROVIDER,
  layerId: USGS_LAYER_ID,
  status: 'ACTIVE',
  kinds: Object.freeze(['PUBLIC DATA OBSERVATION']),
  tier: 'A',
  normalize: normalizeUsgsEarthquakeToWorldEvent,
  notes:
    'Maps existing earthquakes layer records. Epicenter point is source-provided; place text alone stays region.',
});
