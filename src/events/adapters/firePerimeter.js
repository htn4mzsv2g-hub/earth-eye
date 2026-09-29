/**
 * WFIGS fire perimeter → World Event (PUBLIC DATA OBSERVATION).
 * In-memory normalizer only — does not fetch or replace the fire-perimeters layer.
 */

import { createWorldEvent, qualifyEventId } from '../worldEventContract.js';

export const PERIMETER_ADAPTER_ID = 'wfigs-perimeters';
export const PERIMETER_PROVIDER = 'wfigs';
export const PERIMETER_LAYER_ID = 'fire-perimeters';

/**
 * @param {object} row - From normalizeFirePerimeterSnapshot
 * @param {{retrievedAt?: string|number}} [context]
 */
export function normalizeFirePerimeterToWorldEvent(row, context = {}) {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.stableId || row.id || '').trim();
  if (!id) return null;

  const polygons = row.polygons;
  let precision;
  let geometry;
  if (Array.isArray(polygons) && polygons.length) {
    precision = polygons.length > 1 ? 'multipolygon' : 'polygon';
    geometry = {
      type: polygons.length > 1 ? 'MultiPolygon' : 'Polygon',
      coordinates: polygons.length > 1 ? polygons : polygons[0],
    };
  } else if (row.county || row.state || row.name) {
    // No polygon — stay region. Never invent a point from county/state.
    precision = 'region';
    geometry = {
      type: 'Region',
      name: [row.name, row.county, row.state].filter(Boolean).join(', '),
    };
  } else {
    precision = 'unknown';
    geometry = null;
  }

  const discovered = Number(row.discoveredTime);
  const updated = Number(row.updatedTime);
  const firstIso =
    Number.isFinite(discovered) && discovered > 0
      ? new Date(discovered).toISOString()
      : null;
  const updatedIso =
    Number.isFinite(updated) && updated > 0
      ? new Date(updated).toISOString()
      : firstIso;

  return createWorldEvent({
    eventId: qualifyEventId(PERIMETER_PROVIDER, id),
    kind: 'PUBLIC DATA OBSERVATION',
    sources: ['NIFC WFIGS / ArcGIS'],
    category: row.category || 'fire-perimeter',
    title: row.name || `Fire perimeter ${id}`,
    summary: null,
    severity: null, // Do not invent severity from acres/complexity.
    geometry,
    precision,
    eventTime: {
      start: firstIso,
      end: null,
      uncertainty: null,
    },
    firstReported: firstIso,
    lastUpdated: updatedIso,
    retrievedAt: context.retrievedAt || null,
    expiry: null,
    revisionState: 'active',
    related: {
      places: [
        row.county ? { id: `county:${row.county}`, label: row.county } : null,
        row.state ? { id: `state:${row.state}`, label: row.state } : null,
      ].filter(Boolean),
    },
    coverage: {
      limits:
        'Reported incident perimeter geometry from WFIGS — not a prediction of spread or cause attribution.',
      confidence: null,
    },
    attribution: {
      credit: 'NIFC WFIGS',
      license: 'U.S. public domain (agency open data)',
      sourceLinks: [],
    },
    layerId: PERIMETER_LAYER_ID,
    props: {
      acres: Number.isFinite(Number(row.acres)) ? Number(row.acres) : null,
      containedPct: Number.isFinite(Number(row.containedPct))
        ? Number(row.containedPct)
        : null,
      state: row.state || null,
      cause: row.cause || null,
      complexity: row.complexity || null,
    },
  });
}

export const firePerimeterAdapterDescriptor = Object.freeze({
  id: PERIMETER_ADAPTER_ID,
  label: 'WFIGS fire perimeters',
  provider: PERIMETER_PROVIDER,
  layerId: PERIMETER_LAYER_ID,
  status: 'ACTIVE',
  kinds: Object.freeze(['PUBLIC DATA OBSERVATION']),
  tier: 'A',
  normalize: normalizeFirePerimeterToWorldEvent,
  notes:
    'Maps existing fire-perimeters layer records. County/state without polygon stays region.',
});
