/**
 * NWS CAP alert → World Event (OFFICIAL ALERT).
 * In-memory normalizer only — does not fetch or replace the weather-alerts layer.
 */

import { createWorldEvent, qualifyEventId } from '../worldEventContract.js';

export const NWS_ADAPTER_ID = 'nws-alerts';
export const NWS_PROVIDER = 'nws';
export const NWS_LAYER_ID = 'weather-alerts';

/**
 * @param {object} alert - Record from server/providers/nwsAlerts normalizeNwsAlert
 * @param {{retrievedAt?: string|number}} [context]
 */
export function normalizeNwsAlertToWorldEvent(alert, context = {}) {
  if (!alert || typeof alert !== 'object') return null;
  const id = String(alert.id || '').trim();
  if (!id) return null;

  const hasGeom =
    alert.geometry &&
    (alert.geometry.type === 'Polygon' ||
      alert.geometry.type === 'MultiPolygon') &&
    alert.geometry.coordinates;

  // Zone-only / areaDesc products stay region (imprecise). Never invent a point.
  let precision;
  let geometry;
  if (hasGeom) {
    precision =
      alert.geometry.type === 'MultiPolygon' ? 'multipolygon' : 'polygon';
    geometry = {
      type: alert.geometry.type,
      coordinates: alert.geometry.coordinates,
    };
  } else if (alert.areaDesc) {
    precision = 'region';
    geometry = { type: 'Region', name: alert.areaDesc };
  } else {
    precision = 'unknown';
    geometry = null;
  }

  const severityLabel = alert.severity ? String(alert.severity).trim() : null;

  return createWorldEvent({
    eventId: qualifyEventId(NWS_PROVIDER, id),
    kind: 'OFFICIAL ALERT',
    sources: ['NWS / api.weather.gov'],
    category: alert.event || 'Weather Alert',
    title: alert.headline || alert.event || `NWS alert ${id}`,
    summary: alert.description || null,
    severity: severityLabel
      ? {
          scale: 'NWS CAP',
          value: severityLabel,
          label: severityLabel,
        }
      : null,
    geometry,
    precision,
    eventTime: {
      start: alert.onset || null,
      end: alert.ends || alert.expires || null,
      uncertainty: null,
    },
    firstReported: alert.onset || null,
    lastUpdated: alert.onset || null,
    retrievedAt: context.retrievedAt || null,
    expiry: alert.expires || alert.ends || null,
    revisionState: 'active',
    supportingReportRefs: [],
    contradictoryReportRefs: [],
    related: {
      places: alert.areaDesc
        ? [{ id: `area:${alert.areaDesc}`, label: alert.areaDesc }]
        : [],
      note: 'Related refs are contextual only — not causal proof.',
    },
    coverage: {
      limits: hasGeom
        ? 'NWS CAP polygon from api.weather.gov (U.S. public domain).'
        : 'Zone-only product — areaDesc listed; no precise point invented.',
      confidence: null,
      quality: alert.certainty || null,
    },
    attribution: {
      credit: alert.senderName || 'NWS',
      license: 'U.S. public domain (NWS / NOAA)',
      sourceLinks: alert.sourceUrl ? [alert.sourceUrl] : [],
    },
    layerId: NWS_LAYER_ID,
    props: {
      urgency: alert.urgency || null,
      certainty: alert.certainty || null,
      status: alert.status || null,
      instruction: alert.instruction || null,
    },
  });
}

export const nwsAlertAdapterDescriptor = Object.freeze({
  id: NWS_ADAPTER_ID,
  label: 'NWS weather alerts',
  provider: NWS_PROVIDER,
  layerId: NWS_LAYER_ID,
  status: 'ACTIVE',
  kinds: Object.freeze(['OFFICIAL ALERT']),
  tier: 'A',
  normalize: normalizeNwsAlertToWorldEvent,
  notes:
    'Maps existing weather-alerts layer records. Does not replace the Cesium layer.',
});
