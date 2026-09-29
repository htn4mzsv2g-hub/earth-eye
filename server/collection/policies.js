/**
 * Per-provider collection policies (Stage 2 continuous monitoring + Stage 5.3).
 * Cadence is source-specific — never a universal LIVE-under-30s rule.
 * New sources go to the review queue; they are not auto-collected.
 *
 * Stage 5.3: only feeds with retentionPolicy class `retain` may be scheduled
 * for durable storage. Forbidden sources (Vaisala lightning, adsbdb routes,
 * CCTV frames) must never appear here.
 */

/** @typedef {'essential'|'deferred'|'review'|'excluded'} Priority */

/**
 * @type {ReadonlyArray<{
 *   id: string,
 *   layerId: string,
 *   priority: Priority,
 *   intervalMs: number,
 *   timeoutMs: number,
 *   maxRecords: number,
 *   retentionMs: number,
 *   adapter: string,
 *   note: string,
 * }>}
 */
export const COLLECTION_POLICIES = Object.freeze([
  {
    id: 'usgs-earthquakes',
    layerId: 'earthquakes',
    priority: 'essential',
    intervalMs: 60_000,
    timeoutMs: 20_000,
    maxRecords: 500,
    retentionMs: 36 * 3600_000,
    adapter: 'usgs-geojson',
    note: 'USGS all_day GeoJSON; public domain. retention:retain',
  },
  {
    id: 'nws-weather-alerts',
    layerId: 'weather-alerts',
    priority: 'essential',
    intervalMs: 2 * 60_000,
    timeoutMs: 30_000,
    maxRecords: 800,
    retentionMs: 72 * 3600_000,
    adapter: 'nws-alerts',
    note: 'NWS CAP active alerts; U.S. public domain. retention:retain',
  },
  {
    id: 'nhc-cyclones',
    layerId: 'weather-cyclones',
    priority: 'deferred',
    intervalMs: 5 * 60_000,
    timeoutMs: 25_000,
    maxRecords: 50,
    retentionMs: 7 * 24 * 3600_000,
    adapter: 'nhc-current',
    note: 'NOAA NHC/CPHC; adapter deferred until wired. retention:retain',
  },
  {
    id: 'firms-hotspots-keyless',
    layerId: 'local-firms',
    priority: 'deferred',
    intervalMs: 10 * 60_000,
    timeoutMs: 30_000,
    maxRecords: 2000,
    retentionMs: 48 * 3600_000,
    adapter: 'firms-csv',
    note: 'NASA FIRMS keyless; adapter deferred until wired. retention:retain',
  },
]);

/** Sources proposed but not yet reviewed — never auto-collected. */
export const SOURCE_REVIEW_QUEUE = Object.freeze([
  {
    id: 'alertcalifornia-fire-cams',
    proposed: 'ALERTCalifornia + HPWREN fire cameras',
    reason:
      'Non-commercial pack; camera frames are transient only (not observation history).',
    status: 'pending-review',
  },
  {
    id: 'fire-perimeters-wfigs',
    proposed: 'NIFC WFIGS fire perimeters',
    reason: 'Public domain; retention:retain candidate — wire adapter before collect.',
    status: 'pending-review',
  },
]);

export function policyById(id) {
  return COLLECTION_POLICIES.find((p) => p.id === id) || null;
}

export function essentialPolicies() {
  return COLLECTION_POLICIES.filter((p) => p.priority === 'essential');
}
