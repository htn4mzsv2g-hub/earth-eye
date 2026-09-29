/**
 * EE-EVENTS-2 — World Events filter helpers (pure).
 * Kind labels stay honest: NEWS REPORT ≠ OFFICIAL ALERT.
 */

import { EVENT_KINDS } from '../worldEventContract.js';

/** Filter chips shown in the Events UX (subset + alias). */
export const FILTER_KIND_CHIPS = Object.freeze([
  Object.freeze({
    id: 'OFFICIAL ALERT',
    label: 'OFFICIAL ALERT',
    matches: Object.freeze(['OFFICIAL ALERT', 'OFFICIAL REPORT']),
    tone: 'official',
  }),
  Object.freeze({
    id: 'PUBLIC DATA OBSERVATION',
    label: 'PUBLIC DATA OBSERVATION',
    matches: Object.freeze(['PUBLIC DATA OBSERVATION']),
    tone: 'observation',
  }),
  Object.freeze({
    id: 'HUMANITARIAN',
    label: 'HUMANITARIAN',
    matches: Object.freeze(['HUMANITARIAN REPORT']),
    tone: 'humanitarian',
  }),
  Object.freeze({
    id: 'NEWS REPORT',
    label: 'NEWS REPORT',
    matches: Object.freeze(['NEWS REPORT']),
    tone: 'news',
    note: 'News ≠ official alert / sensor fact',
  }),
]);

export const SOURCE_FILTER_IDS = Object.freeze([
  'nws-alerts',
  'usgs-earthquakes',
  'nasa-firms',
  'wfigs-perimeters',
  'noaa-cyclones',
  'gdacs',
  'reliefweb',
  'gdelt',
]);

export const TIER_FILTER_IDS = Object.freeze(['A', 'B', 'C']);

const SOURCE_PREFIX = Object.freeze({
  'nws-alerts': 'nws:',
  'usgs-earthquakes': 'usgs:',
  'nasa-firms': 'nasa-firms:',
  'wfigs-perimeters': 'wfigs:',
  'noaa-cyclones': 'noaa-nhc:',
  gdacs: 'gdacs:',
  gdelt: 'gdelt:',
  reliefweb: 'reliefweb:',
});

const SOURCE_TIER = Object.freeze({
  'nws-alerts': 'A',
  'usgs-earthquakes': 'A',
  'nasa-firms': 'A',
  'wfigs-perimeters': 'A',
  'noaa-cyclones': 'A',
  gdacs: 'B',
  reliefweb: 'B',
  gdelt: 'C',
});

/** Empty filter state = show all authentic kinds (no fabricated busy). */
export function emptyFilters() {
  return {
    kinds: [],
    tiers: [],
    sources: [],
  };
}

export function kindChipForEventKind(kind) {
  const k = String(kind || '');
  return FILTER_KIND_CHIPS.find((c) => c.matches.includes(k)) || null;
}

export function kindTone(kind) {
  return kindChipForEventKind(kind)?.tone || 'other';
}

/** Short honest label for list/marker (never collapses NEWS into OFFICIAL). */
export function kindShortLabel(kind) {
  const k = String(kind || '');
  if (k === 'OFFICIAL ALERT' || k === 'OFFICIAL REPORT') return 'OFFICIAL';
  if (k === 'PUBLIC DATA OBSERVATION') return 'PUBLIC DATA';
  if (k === 'HUMANITARIAN REPORT') return 'HUMANITARIAN';
  if (k === 'NEWS REPORT') return 'NEWS';
  if (k === 'EARTH EYE ANALYSIS') return 'ANALYSIS';
  return k || 'UNKNOWN';
}

export function sourceIdFromEvent(event) {
  const id = String(event?.eventId || '');
  for (const [sourceId, prefix] of Object.entries(SOURCE_PREFIX)) {
    if (id.startsWith(prefix)) return sourceId;
  }
  const layer = event?.layerId;
  if (layer && SOURCE_PREFIX[layer]) return layer;
  return null;
}

export function tierFromEvent(event) {
  const src = sourceIdFromEvent(event);
  return src ? SOURCE_TIER[src] || null : null;
}

/**
 * Apply kind / tier / source filters. Empty arrays mean "all".
 * @param {object[]} events
 * @param {{kinds?: string[], tiers?: string[], sources?: string[]}} filters
 */
export function applyEventFilters(events, filters = {}) {
  const list = Array.isArray(events) ? events : [];
  const kinds = Array.isArray(filters.kinds) ? filters.kinds.filter(Boolean) : [];
  const tiers = Array.isArray(filters.tiers) ? filters.tiers.filter(Boolean) : [];
  const sources = Array.isArray(filters.sources)
    ? filters.sources.filter(Boolean)
    : [];

  const kindSet = new Set();
  for (const chipId of kinds) {
    const chip = FILTER_KIND_CHIPS.find((c) => c.id === chipId);
    if (chip) chip.matches.forEach((m) => kindSet.add(m));
    else if (EVENT_KINDS.includes(chipId)) kindSet.add(chipId);
  }

  return list.filter((ev) => {
    if (kindSet.size && !kindSet.has(ev.kind)) return false;
    if (sources.length) {
      const sid = sourceIdFromEvent(ev);
      if (!sid || !sources.includes(sid)) return false;
    }
    if (tiers.length) {
      const t = tierFromEvent(ev);
      if (!t || !tiers.includes(t)) return false;
    }
    return true;
  });
}

export function toggleFilterValue(list, value) {
  const arr = Array.isArray(list) ? [...list] : [];
  const i = arr.indexOf(value);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(value);
  return arr;
}

export { SOURCE_PREFIX, SOURCE_TIER };
