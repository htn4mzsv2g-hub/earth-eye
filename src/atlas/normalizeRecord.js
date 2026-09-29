/**
 * Stage 2 record envelope (product standard).
 * Layers adopt this when they normalize provider payloads so observation,
 * publication and retrieval times never collapse into one "updated" field,
 * and predicted/forecast data cannot be labelled as observed.
 *
 * No H3/PostGIS — plain objects only.
 */

import { deriveRecordClass, sourceFor } from './dataSourceRegistry.js';

/**
 * @param {object} o
 * @param {string} o.layerId Registry layer id
 * @param {string} o.providerId Stable id within the provider (icao, event id, …)
 * @param {{lon:number,lat:number,alt?:number}|object|null} [o.geometry]
 * @param {string|null} [o.precision] e.g. 'exact','approx','region','unknown'
 * @param {number|null} [o.observedAt] Provider observation/event time (ms)
 * @param {number|null} [o.publishedAt] Provider publication time (ms)
 * @param {number|null} [o.retrievedAt] When we received it (ms); defaults to now
 * @param {string|null} [o.sourceUrl]
 * @param {string|null} [o.category]
 * @param {string|null} [o.units]
 * @param {'observed'|'reported'|'predicted'|'forecast'|'snapshot'|null} [o.recordClass]
 * @param {object} [o.quality] Free-form quality flags
 * @param {object} [o.props] Domain-specific fields
 */
export function normalizeRecord(o = {}) {
  const layerId = String(o.layerId || '');
  const entry = layerId ? sourceFor(layerId) : {};
  const provider = entry.provider || o.provider || 'unknown';
  const providerId = String(o.providerId || o.id || '').trim();
  if (!layerId || !providerId)
    throw new Error('normalizeRecord requires layerId and providerId');
  const observedAt = finiteMs(o.observedAt);
  const publishedAt = finiteMs(o.publishedAt);
  const retrievedAt = finiteMs(o.retrievedAt) ?? Date.now();
  const recordClass =
    o.recordClass &&
    ['observed', 'reported', 'predicted', 'forecast', 'snapshot'].includes(
      o.recordClass,
    )
      ? o.recordClass
      : deriveRecordClass(entry);
  return Object.freeze({
    id: `${layerId}:${providerId}`,
    layerId,
    providerId,
    provider,
    geometry: o.geometry ?? null,
    precision: o.precision || 'unknown',
    observedAt,
    publishedAt,
    retrievedAt,
    // Never substitute retrieval for observation (rule 5/6).
    sourceUrl: o.sourceUrl || entry.sourceUrl || null,
    category: o.category || null,
    units: o.units || null,
    recordClass,
    quality: Object.freeze({ ...(o.quality || {}) }),
    attribution: entry.attribution || entry.credit || provider,
    license: entry.license || null,
    props: Object.freeze({ ...(o.props || {}) }),
  });
}

function finiteMs(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
