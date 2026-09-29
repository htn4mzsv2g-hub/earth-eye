/**
 * NASA FIRMS fire detection → World Event (PUBLIC DATA OBSERVATION).
 * In-memory normalizer only — does not fetch or replace the local-firms layer.
 */

import { createWorldEvent, qualifyEventId } from '../worldEventContract.js';

export const FIRMS_ADAPTER_ID = 'nasa-firms';
export const FIRMS_PROVIDER = 'nasa-firms';
export const FIRMS_LAYER_ID = 'local-firms';

/**
 * @param {object} fire - Internal FIRMS fire record (firmsAdapt shape)
 * @param {{retrievedAt?: string|number}} [context]
 */
export function normalizeFirmsDetectionToWorldEvent(fire, context = {}) {
  if (!fire || typeof fire !== 'object') return null;
  const lon = Number(fire.lon);
  const lat = Number(fire.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;

  const acqMs = Number(fire.acqMs);
  const timeIso =
    Number.isFinite(acqMs) && acqMs > 0 ? new Date(acqMs).toISOString() : null;
  const sat = String(fire.satellite || fire.sensor || 'unknown').trim();
  const id =
    String(fire.id || '').trim() ||
    `${lat.toFixed(4)}:${lon.toFixed(4)}:${acqMs > 0 ? acqMs : 0}:${sat}`;

  // FIRMS detection cell center is source-provided → point is honest.
  // Confidence is only attached when the source provided it (0..1).
  const confidence = Number(fire.confidence);
  const hasConfidence =
    Number.isFinite(confidence) && confidence >= 0 && confidence <= 1;

  return createWorldEvent({
    eventId: qualifyEventId(FIRMS_PROVIDER, id),
    kind: 'PUBLIC DATA OBSERVATION',
    sources: ['NASA FIRMS'],
    category: 'fire-detection',
    title: `Fire detection${sat && sat !== 'unknown' ? ` · ${sat}` : ''}`,
    summary: null,
    severity: null, // Do not invent severity from FRP.
    geometry: { type: 'Point', lon, lat },
    precision: 'point',
    eventTime: { start: timeIso, end: null, uncertainty: null },
    firstReported: timeIso,
    lastUpdated: timeIso,
    retrievedAt: context.retrievedAt || null,
    expiry: null,
    revisionState: 'active',
    related: {},
    coverage: {
      limits:
        'Thermal anomaly detection cell — not a confirmed wildfire perimeter or cause.',
      confidence: hasConfidence ? confidence : null,
    },
    attribution: {
      credit: 'NASA FIRMS',
      license: 'NASA Earthdata / FIRMS terms',
      sourceLinks: ['https://firms.modaps.eosdis.nasa.gov/'],
    },
    layerId: FIRMS_LAYER_ID,
    props: {
      frp: Number.isFinite(Number(fire.frp)) ? Number(fire.frp) : null,
      satellite: sat !== 'unknown' ? sat : null,
      brightness: Number.isFinite(Number(fire.brightness))
        ? Number(fire.brightness)
        : null,
    },
  });
}

export const firmsDetectionAdapterDescriptor = Object.freeze({
  id: FIRMS_ADAPTER_ID,
  label: 'NASA FIRMS detections',
  provider: FIRMS_PROVIDER,
  layerId: FIRMS_LAYER_ID,
  status: 'ACTIVE',
  kinds: Object.freeze(['PUBLIC DATA OBSERVATION']),
  tier: 'A',
  normalize: normalizeFirmsDetectionToWorldEvent,
  notes:
    'Maps existing local-firms detection records. Detection ≠ confirmed incident cause.',
});
