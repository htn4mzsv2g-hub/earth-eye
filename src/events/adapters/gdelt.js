/**
 * GDELT DOC 2.0 → World Event (NEWS REPORT discovery ONLY).
 * Never promote headlines to OFFICIAL ALERT. Never invent precise points from
 * city/country-level geography — precision stays region/unknown.
 *
 * Terms: unrestricted academic/commercial/governmental dataset use with citation
 * (see DATA_SOURCES.md / gdeltproject.org terms).
 */

import { createWorldEvent, qualifyEventId } from '../worldEventContract.js';

function simpleId(s) {
  // Deterministic short id without Node Buffer (browser-safe).
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const tail = str.replace(/[^a-zA-Z0-9]+/g, '').slice(-24);
  return `${(h >>> 0).toString(36)}:${tail || 'x'}`;
}

export const GDELT_ADAPTER_ID = 'gdelt';
export const GDELT_PROVIDER = 'gdelt';

/**
 * @param {object} article - GDELT artlist article row
 * @param {{retrievedAt?: string|number, queryPlace?: string}} [context]
 */
export function normalizeGdeltArticleToWorldEvent(article, context = {}) {
  if (!article || typeof article !== 'object') return null;
  const url = String(article.url || article.documentIdentifier || '').trim();
  const title = String(article.title || '').trim();
  if (!url || !title) return null;

  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }

  // Stable id from URL — never fabricate a sensor id.
  const id = `${host}:${simpleId(url)}`;

  // Geography: sourcecountry / query place only → region. NEVER Point from city.
  const country = article.sourcecountry || article.sourceCountry || null;
  const placeHint =
    context.queryPlace || article.location || article.place || country || null;

  let precision;
  let geometry;
  if (placeHint) {
    precision = 'region';
    geometry = { type: 'Region', name: String(placeHint) };
  } else {
    precision = 'unknown';
    geometry = null;
  }

  const seen = article.seendate || article.seenDate || article.publishedAt || null;
  let seenIso = null;
  if (seen) {
    const s = String(seen);
    // GDELT seendate often YYYYMMDDTHHMMSSZ
    if (/^\d{8}T\d{6}Z$/.test(s)) {
      seenIso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}.000Z`;
    } else {
      const ms = Date.parse(s);
      if (Number.isFinite(ms)) seenIso = new Date(ms).toISOString();
    }
  }

  return createWorldEvent({
    eventId: qualifyEventId(GDELT_PROVIDER, id),
    kind: 'NEWS REPORT',
    sources: ['GDELT Project DOC 2.0', host].filter(Boolean),
    category: 'news-discovery',
    title: title.slice(0, 240),
    summary: null,
    severity: null, // Never invent severity from a headline.
    geometry,
    precision,
    eventTime: {
      start: seenIso,
      end: null,
      uncertainty:
        'News discovery only — not a verified incident or sensor observation.',
    },
    firstReported: seenIso,
    lastUpdated: seenIso,
    retrievedAt: context.retrievedAt || null,
    expiry: null,
    revisionState: 'active',
    related: {
      places: placeHint
        ? [{ id: `place:${placeHint}`, label: String(placeHint) }]
        : [],
    },
    coverage: {
      limits:
        'GDELT headline/index match. Not an official alert, not a sensor fact, not causal proof. Linked articles retain publisher terms.',
      confidence: null,
    },
    attribution: {
      credit: 'GDELT Project',
      license: 'GDELT terms (citation required); article © publisher',
      sourceLinks: [url, 'https://www.gdeltproject.org/'],
    },
    layerId: null,
    props: {
      domain: host || null,
      language: article.language || null,
      sourcecountry: country ? String(country) : null,
      discoveryOnly: true,
    },
  });
}

export const gdeltAdapterDescriptor = Object.freeze({
  id: GDELT_ADAPTER_ID,
  label: 'GDELT',
  provider: GDELT_PROVIDER,
  layerId: null,
  status: 'ACTIVE',
  kinds: Object.freeze(['NEWS REPORT']),
  tier: 'C',
  normalize: normalizeGdeltArticleToWorldEvent,
  notes:
    'Tier C NEWS REPORT discovery only — never treat headlines as sensor facts. City/region geography stays imprecise. Live fetch via server world-events.',
});
