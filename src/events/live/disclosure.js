/**
 * EE-EVENTS-2 — Compact source + time disclosure (pure).
 * Not a full detail panel (EE-EVENTS-3). Related ≠ causal.
 */

import { kindShortLabel, kindTone, sourceIdFromEvent } from './filters.js';
import { isImpreciseGeography } from '../worldEventContract.js';

/**
 * Build a compact disclosure object for selection card / list detail strip.
 * @param {object} event - Validated World Event
 */
export function compactDisclosure(event) {
  if (!event || typeof event !== 'object') return null;

  const sources = Array.isArray(event.sources)
    ? event.sources.map(String).filter(Boolean)
    : [];
  const attributionCredit =
    event.attribution?.credit || sources[0] || 'Unknown source';
  const precision = event.precision || 'unknown';
  const imprecise = isImpreciseGeography(precision);

  return Object.freeze({
    eventId: String(event.eventId || ''),
    kind: String(event.kind || ''),
    kindLabel: kindShortLabel(event.kind),
    kindTone: kindTone(event.kind),
    newsIsNotOfficial: event.kind === 'NEWS REPORT',
    title: String(event.title || event.eventId || 'World Event'),
    category: event.category || null,
    sources: Object.freeze([...sources]),
    sourceId: sourceIdFromEvent(event),
    attribution: attributionCredit,
    license: event.attribution?.license || null,
    sourceLinks: Object.freeze([
      ...(Array.isArray(event.attribution?.sourceLinks)
        ? event.attribution.sourceLinks.map(String)
        : []),
    ]),
    eventTimeStart: event.eventTime?.start || null,
    eventTimeEnd: event.eventTime?.end || null,
    eventTimeUncertainty: event.eventTime?.uncertainty || null,
    retrievedAt: event.retrievedAt || null,
    lastUpdated: event.lastUpdated || null,
    precision,
    precisionNote: imprecise
      ? 'Geography is imprecise (city/region/unknown) — no invented precise point.'
      : precision === 'point'
        ? 'Point from source-provided coordinates.'
        : precision === 'polygon' || precision === 'multipolygon'
          ? 'Extent from source geometry (marker uses extent center).'
          : `Precision: ${precision}.`,
    coverageNote: event.coverage?.limits || event.coverage?.note || null,
    revisionState: event.revisionState || null,
    relatedNote:
      event.related?.note ||
      'Related refs are contextual only — not causal proof.',
    // Compact lines for UI (ordered).
    lines: Object.freeze(buildLines(event, attributionCredit, precision, imprecise)),
  });
}

function buildLines(event, credit, precision, imprecise) {
  const lines = [];
  lines.push({
    key: 'kind',
    label: 'Kind',
    value:
      event.kind === 'NEWS REPORT'
        ? 'NEWS REPORT (not an official alert / sensor fact)'
        : String(event.kind),
  });
  lines.push({
    key: 'source',
    label: 'Source',
    value: credit,
  });
  if (Array.isArray(event.sources) && event.sources.length > 1) {
    lines.push({
      key: 'sources',
      label: 'Sources',
      value: event.sources.join(' · '),
    });
  }
  lines.push({
    key: 'eventTime',
    label: 'Event time',
    value: formatTimeRange(event.eventTime?.start, event.eventTime?.end),
  });
  lines.push({
    key: 'retrieved',
    label: 'Retrieved',
    value: formatIso(event.retrievedAt) || 'not reported',
  });
  lines.push({
    key: 'precision',
    label: 'Precision',
    value: imprecise
      ? `${precision} (imprecise — city/region stays coarse)`
      : precision,
  });
  if (event.attribution?.credit) {
    lines.push({
      key: 'attribution',
      label: 'Attribution',
      value: event.attribution.credit,
    });
  }
  return lines;
}

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
  return 'not reported by source';
}

/**
 * HTML-safe plain-text block for selection card hint (caller escapes).
 */
export function disclosureHintText(disclosure) {
  if (!disclosure) return '';
  const parts = [
    disclosure.kind,
    `src ${disclosure.attribution}`,
    disclosure.eventTimeStart
      ? `event ${disclosure.eventTimeStart}`
      : 'event time n/a',
    disclosure.retrievedAt
      ? `retrieved ${disclosure.retrievedAt}`
      : 'retrieved n/a',
    `precision ${disclosure.precision}`,
  ];
  if (disclosure.newsIsNotOfficial) parts.push('NEWS ≠ OFFICIAL');
  return parts.join(' · ');
}
