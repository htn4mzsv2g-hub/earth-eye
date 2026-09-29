/**
 * EE-EVENTS-3 — Full World Event detail model (pure).
 * Provenance honesty; severity null unless source-provided; Related ≠ causal.
 * No FOLLOW (EE-EVENTS-4).
 */

import { kindShortLabel, kindTone, sourceIdFromEvent } from './filters.js';
import { isImpreciseGeography } from '../worldEventContract.js';
import { markerAnchorFromEvent } from './cohort.js';

const RELATED_NOTE =
  'RELATED conditions are contextual proximity only — not causal proof. Earth Eye does not claim this event caused them.';

function formatIso(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return String(iso);
  try {
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  } catch {
    return String(iso);
  }
}

function formatTimeRange(start, end) {
  const a = formatIso(start);
  const b = formatIso(end);
  if (a && b) return `${a} → ${b}`;
  if (a) return a;
  if (b) return `until ${b}`;
  return null;
}

function severityFromEvent(event) {
  const sev = event?.severity;
  if (sev == null || sev === '') return null;
  if (typeof sev === 'object') {
    const label = sev.label || sev.scale || null;
    const value = sev.value == null ? null : sev.value;
    if (label == null && value == null) return null;
    return Object.freeze({
      label: label != null ? String(label) : null,
      value,
      scale: sev.scale != null ? String(sev.scale) : null,
      sourceProvided: true,
    });
  }
  return Object.freeze({
    label: String(sev),
    value: null,
    scale: null,
    sourceProvided: true,
  });
}

function geometryHonesty(event) {
  const precision = event?.precision || 'unknown';
  const imprecise = isImpreciseGeography(precision);
  const anchor = markerAnchorFromEvent(event);
  let note;
  if (imprecise) {
    note =
      'Geography is imprecise (city/region/unknown) — no invented precise point.';
  } else if (precision === 'point') {
    note = anchor
      ? 'Point from source-provided coordinates.'
      : 'Point precision claimed but coordinates missing from source.';
  } else if (precision === 'polygon' || precision === 'multipolygon') {
    note = 'Extent from source geometry (marker uses extent center when plotted).';
  } else if (precision === 'bbox') {
    note = 'Bounding box from source; marker uses box center when plotted.';
  } else {
    note = `Precision: ${precision}.`;
  }
  return Object.freeze({
    precision,
    imprecise,
    hasPlottableAnchor: Boolean(anchor),
    anchor: anchor
      ? Object.freeze({ lat: anchor.lat, lon: anchor.lon, kind: anchor.kind || null })
      : null,
    note,
    regionName:
      event?.geometry?.type === 'Region'
        ? event.geometry.name || null
        : event?.geometry?.name || null,
  });
}

/**
 * Build the EE-EVENTS-3 detail surface model.
 * @param {object} event
 */
export function buildEventDetail(event) {
  if (!event?.eventId) return null;
  const sources = Array.isArray(event.sources)
    ? event.sources.map(String).filter(Boolean)
    : [];
  const links = Array.isArray(event.attribution?.sourceLinks)
    ? event.attribution.sourceLinks.map(String).filter(Boolean)
    : [];
  const publishedAt =
    event.publishedAt ||
    event.firstReported ||
    event.attribution?.publishedAt ||
    event.eventTime?.published ||
    null;
  const severity = severityFromEvent(event);
  const geo = geometryHonesty(event);
  const status = event.revisionState || event.status || null;

  return Object.freeze({
    eventId: String(event.eventId),
    name: String(event.title || event.eventId),
    kind: String(event.kind || ''),
    kindLabel: kindShortLabel(event.kind),
    kindTone: kindTone(event.kind),
    newsIsNotOfficial: event.kind === 'NEWS REPORT',
    category: event.category || null,
    sources: Object.freeze([...sources]),
    sourceId: sourceIdFromEvent(event),
    attribution: Object.freeze({
      credit: event.attribution?.credit || sources[0] || 'Unknown source',
      license: event.attribution?.license || null,
      sourceLinks: Object.freeze([...links]),
    }),
    times: Object.freeze({
      event: formatTimeRange(event.eventTime?.start, event.eventTime?.end),
      eventStart: formatIso(event.eventTime?.start),
      eventEnd: formatIso(event.eventTime?.end),
      eventUncertainty: event.eventTime?.uncertainty || null,
      retrieved: formatIso(event.retrievedAt),
      published: formatIso(publishedAt),
      lastUpdated: formatIso(event.lastUpdated),
    }),
    geometry: geo,
    severity, // null when source did not provide
    status,
    revisionState: event.revisionState || null,
    coverageNote: event.coverage?.limits || event.coverage?.note || null,
    relatedNote: event.related?.note || RELATED_NOTE,
    relatedBanner: RELATED_NOTE,
  });
}

export { RELATED_NOTE };
