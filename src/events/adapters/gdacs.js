/**
 * GDACS → World Event (HUMANITARIAN REPORT / OFFICIAL ALERT).
 * Public API; attribute “Global Disaster Alert and Coordination System, GDACS”.
 * GDACS does not replace national official alerts — coverage note required.
 */

import { createWorldEvent, qualifyEventId } from '../worldEventContract.js';

export const GDACS_ADAPTER_ID = 'gdacs';
export const GDACS_PROVIDER = 'gdacs';

const ALERT_LEVELS = new Set(['red', 'orange', 'green']);

function alertLevel(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  return ALERT_LEVELS.has(s) ? s : null;
}

/**
 * @param {object} feature - GDACS GeoJSON Feature (geteventlist/SEARCH)
 * @param {{retrievedAt?: string|number}} [context]
 */
export function normalizeGdacsFeatureToWorldEvent(feature, context = {}) {
  if (!feature || typeof feature !== 'object') return null;
  const props = feature.properties || feature;
  const eventIdRaw = props.eventid ?? props.eventId ?? props.episodeid ?? props.id;
  if (eventIdRaw == null || eventIdRaw === '') return null;
  const eventType = String(props.eventtype || props.eventType || 'hazard')
    .trim()
    .toUpperCase();
  const id = `${eventType}:${eventIdRaw}`;

  const coords = feature.geometry?.coordinates;
  const lon = Number(coords?.[0] ?? props.longitude ?? props.lon);
  const lat = Number(coords?.[1] ?? props.latitude ?? props.lat);
  const hasPoint =
    feature.geometry?.type === 'Point' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    Math.abs(lon) <= 180 &&
    Math.abs(lat) <= 90;

  const country = props.country || props.iso3 || null;
  let precision;
  let geometry;
  if (hasPoint) {
    // GDACS-provided model centroid/epicenter — source point, not city invent.
    precision = 'point';
    geometry = { type: 'Point', lon, lat };
  } else if (country) {
    precision = 'region';
    geometry = { type: 'Region', name: String(country) };
  } else {
    precision = 'unknown';
    geometry = null;
  }

  const level = alertLevel(props.alertlevel || props.alertLevel);
  // Red/Orange are GDACS alert products → OFFICIAL ALERT (GDACS as source).
  // Green / unknown → HUMANITARIAN REPORT. Never claim national authority.
  const kind =
    level === 'red' || level === 'orange'
      ? 'OFFICIAL ALERT'
      : 'HUMANITARIAN REPORT';

  const fromdate = props.fromdate || props.fromDate || props.date || null;
  const todate = props.todate || props.toDate || null;
  const name = props.name || props.description || `${eventType} ${eventIdRaw}`;
  const score = Number(props.alertscore ?? props.alertScore);
  const reportUrl =
    props.url?.report ||
    props.url?.details ||
    (typeof props.url === 'string' ? props.url : null) ||
    `https://www.gdacs.org/report.aspx?eventid=${encodeURIComponent(String(eventIdRaw))}&eventtype=${encodeURIComponent(eventType)}`;

  return createWorldEvent({
    eventId: qualifyEventId(GDACS_PROVIDER, id),
    kind,
    sources: ['GDACS'],
    category: eventType,
    title: String(name).slice(0, 240),
    summary: props.description ? String(props.description).slice(0, 2000) : null,
    severity: level
      ? {
          scale: 'GDACS alertlevel',
          value: level,
          label: level.toUpperCase(),
        }
      : Number.isFinite(score)
        ? { scale: 'GDACS alertscore', value: score, label: String(score) }
        : null,
    geometry,
    precision,
    eventTime: {
      start: fromdate,
      end: todate,
      uncertainty: 'GDACS model estimates may be automated and unverified.',
    },
    firstReported: fromdate,
    lastUpdated: todate || fromdate,
    retrievedAt: context.retrievedAt || null,
    expiry: null,
    revisionState: 'active',
    related: {
      places: country
        ? [{ id: `country:${country}`, label: String(country) }]
        : [],
    },
    coverage: {
      limits:
        'GDACS does not replace official local/national disaster management alerts. Automated estimates may contain errors.',
      confidence: null,
      note: level ? `alertlevel=${level}` : null,
    },
    attribution: {
      credit: 'Global Disaster Alert and Coordination System, GDACS',
      license: 'GDACS terms of use (acknowledge source)',
      sourceLinks: [reportUrl].filter(Boolean),
    },
    layerId: null,
    props: {
      eventtype: eventType,
      alertlevel: level,
      alertscore: Number.isFinite(score) ? score : null,
      episodeid: props.episodeid ?? props.episodeId ?? null,
      iso3: props.iso3 || null,
      country: country ? String(country) : null,
    },
  });
}

export const gdacsAdapterDescriptor = Object.freeze({
  id: GDACS_ADAPTER_ID,
  label: 'GDACS',
  provider: GDACS_PROVIDER,
  layerId: null,
  status: 'ACTIVE',
  kinds: Object.freeze(['OFFICIAL ALERT', 'HUMANITARIAN REPORT']),
  tier: 'B',
  normalize: normalizeGdacsFeatureToWorldEvent,
  notes:
    'Tier B. Public GDACS API; attribute GDACS. Does not replace national official alerts. Live fetch via server world-events.',
});
