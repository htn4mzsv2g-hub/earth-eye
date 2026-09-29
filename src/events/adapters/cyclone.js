/**
 * NOAA / NHC active cyclone → World Event (OFFICIAL ALERT).
 * In-memory normalizer only — does not fetch or replace the weather-cyclones layer.
 */

import { createWorldEvent, qualifyEventId } from '../worldEventContract.js';

export const CYCLONE_ADAPTER_ID = 'noaa-cyclones';
export const CYCLONE_PROVIDER = 'noaa-nhc';
export const CYCLONE_LAYER_ID = 'weather-cyclones';

/**
 * @param {object} storm - From validateCycloneSnapshot storms[]
 * @param {{retrievedAt?: string|number, attribution?: string, source?: string}} [context]
 */
export function normalizeCycloneToWorldEvent(storm, context = {}) {
  if (!storm || typeof storm !== 'object') return null;
  const id = String(storm.id || '').trim();
  if (!id) return null;

  const pos = storm.position;
  const lon = Number(pos?.longitude ?? pos?.lon ?? pos?.[0]);
  const lat = Number(pos?.latitude ?? pos?.lat ?? pos?.[1]);
  const hasPoint =
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    Math.abs(lon) <= 180 &&
    Math.abs(lat) <= 90;

  // Position is source-provided advisory center when present.
  // Cone/track geometry is extent — prefer polygon when current; else point/unknown.
  let precision;
  let geometry;
  if (storm.geometryStatus === 'current' && storm.cone?.coordinates) {
    precision = storm.cone.type === 'MultiPolygon' ? 'multipolygon' : 'polygon';
    geometry = {
      type: storm.cone.type || 'Polygon',
      coordinates: storm.cone.coordinates,
    };
  } else if (hasPoint) {
    precision = 'point';
    geometry = { type: 'Point', lon, lat };
  } else if (storm.basin || storm.name) {
    precision = 'region';
    geometry = {
      type: 'Region',
      name: [storm.name, storm.basin].filter(Boolean).join(' · '),
    };
  } else {
    precision = 'unknown';
    geometry = null;
  }

  const issuedAt = storm.issuedAt || storm.positionAt || null;
  const windKt = Number(storm.windKt);

  return createWorldEvent({
    eventId: qualifyEventId(CYCLONE_PROVIDER, id),
    kind: 'OFFICIAL ALERT',
    sources: [context.source || 'NOAA / NHC'],
    category: storm.classification || 'tropical-cyclone',
    title: storm.name
      ? `${storm.classification || 'Cyclone'} ${storm.name}`
      : `Cyclone ${id}`,
    summary: null,
    severity: Number.isFinite(windKt)
      ? {
          scale: 'max sustained wind (kt)',
          value: windKt,
          label: `${windKt} kt`,
        }
      : null,
    geometry,
    precision,
    eventTime: {
      start: issuedAt,
      end: null,
      uncertainty:
        storm.geometryStatus === 'pending'
          ? 'Advisory geometry pending'
          : storm.geometryStatus === 'unavailable'
            ? 'Advisory geometry unavailable'
            : null,
    },
    firstReported: issuedAt,
    lastUpdated: issuedAt,
    retrievedAt: context.retrievedAt || null,
    expiry: null,
    revisionState:
      storm.geometryStatus === 'unavailable' ? 'unknown' : 'active',
    related: {},
    coverage: {
      limits:
        'Official tropical cyclone advisory. Forecast cone is not a certainty of landfall or impact.',
      confidence: null,
      note: storm.geometryStatus
        ? `geometryStatus=${storm.geometryStatus}`
        : null,
    },
    attribution: {
      credit: context.attribution || 'NOAA / National Hurricane Center',
      license: 'U.S. public domain',
      sourceLinks: [storm.advisoryUrl, storm.outlookUrl].filter(Boolean),
    },
    layerId: CYCLONE_LAYER_ID,
    props: {
      basin: storm.basin || null,
      advisoryNumber: storm.advisoryNumber ?? null,
      windKt: Number.isFinite(windKt) ? windKt : null,
      pressureHpa: Number.isFinite(Number(storm.pressureHpa))
        ? Number(storm.pressureHpa)
        : null,
      geometryStatus: storm.geometryStatus || null,
    },
  });
}

export const cycloneAdapterDescriptor = Object.freeze({
  id: CYCLONE_ADAPTER_ID,
  label: 'NOAA active cyclones',
  provider: CYCLONE_PROVIDER,
  layerId: CYCLONE_LAYER_ID,
  status: 'ACTIVE',
  kinds: Object.freeze(['OFFICIAL ALERT']),
  tier: 'A',
  normalize: normalizeCycloneToWorldEvent,
  notes:
    'Maps existing weather-cyclones layer records. Forecast cone ≠ impact certainty.',
});
