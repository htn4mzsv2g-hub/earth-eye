/**
 * Stage 5.3 — Permitted observation retention.
 *
 * Product standard: history respects retention permissions; "what changed?"
 * only with retained observations; never invent history.
 *
 * Explicit deny beats allow. Unknown / unreviewed sources are NOT retained.
 * Collection policies must only schedule feeds marked `retain: true` here.
 */

/** @typedef {'retain'|'forbid'|'transient'|'unknown'} RetentionClass */

/**
 * @type {ReadonlyArray<{
 *   id: string,
 *   layerId: string,
 *   class: RetentionClass,
 *   reason: string,
 *   maxRetentionMs: number|null,
 * }>}
 */
export const RETENTION_RULES = Object.freeze([
  {
    id: 'usgs-earthquakes',
    layerId: 'earthquakes',
    class: 'retain',
    reason: 'USGS earthquake GeoJSON is U.S. public domain.',
    maxRetentionMs: 36 * 3600_000,
  },
  {
    id: 'nhc-cyclones',
    layerId: 'weather-cyclones',
    class: 'retain',
    reason: 'NOAA NHC/CPHC storm products are U.S. public domain.',
    maxRetentionMs: 7 * 24 * 3600_000,
  },
  {
    id: 'firms-hotspots-keyless',
    layerId: 'local-firms',
    class: 'retain',
    reason: 'NASA FIRMS open hotspot products permit redistributed archives within stated use.',
    maxRetentionMs: 48 * 3600_000,
  },
  {
    id: 'nws-weather-alerts',
    layerId: 'weather-alerts',
    class: 'retain',
    reason: 'NWS CAP alerts via api.weather.gov are U.S. public domain.',
    maxRetentionMs: 72 * 3600_000,
  },
  {
    id: 'fire-perimeters',
    layerId: 'fire-perimeters',
    class: 'retain',
    reason: 'NIFC WFIGS open data (U.S. public domain). Not auto-collected yet.',
    maxRetentionMs: 7 * 24 * 3600_000,
  },
  {
    id: 'weather-lightning',
    layerId: 'weather-lightning',
    class: 'forbid',
    reason:
      'NOAA nowCOAST lightning density is Vaisala-derived: display/proxy only — no durable store/export.',
    maxRetentionMs: null,
  },
  {
    id: 'adsbdb-routes',
    layerId: 'flights',
    class: 'forbid',
    reason:
      'adsbdb route data credits forbid copying into other databases; memory TTL only, never durable history.',
    maxRetentionMs: null,
  },
  {
    id: 'cctv-frames',
    layerId: 'cctv',
    class: 'transient',
    reason:
      'Camera frames/clips are transient media for display only; not retained as observation history beyond proxy cache TTL.',
    maxRetentionMs: null,
  },
  {
    id: 'traffic-simulated',
    layerId: 'traffic',
    class: 'forbid',
    reason: 'Simulated traffic is policy-excluded; never retained as observations.',
    maxRetentionMs: null,
  },
]);

const byId = new Map(RETENTION_RULES.map((r) => [r.id, r]));
const byLayer = new Map();
for (const r of RETENTION_RULES) {
  if (!byLayer.has(r.layerId)) byLayer.set(r.layerId, []);
  byLayer.get(r.layerId).push(r);
}

/** @param {string} feedId */
export function retentionForFeed(feedId) {
  return byId.get(String(feedId || '')) || null;
}

/** @param {string} layerId */
export function retentionRulesForLayer(layerId) {
  return byLayer.get(String(layerId || '')) || [];
}

/** True only when an explicit retain rule exists for this collection feed id. */
export function mayRetainFeed(feedId) {
  const rule = retentionForFeed(feedId);
  return Boolean(rule && rule.class === 'retain');
}

/**
 * Layer-level: retain only if every known rule for that layer allows retain,
 * or at least one retain rule and no forbid/transient blocking durable history.
 * Prefer feed-level checks for collection.
 */
export function mayRetainLayer(layerId) {
  const rules = retentionRulesForLayer(layerId);
  if (!rules.length) return false;
  if (rules.some((r) => r.class === 'forbid' || r.class === 'transient')) {
    // Mixed layer (e.g. flights + adsbdb-routes): durable layer history not permitted.
    return rules.every((r) => r.class === 'retain');
  }
  return rules.some((r) => r.class === 'retain');
}

export function listRetentionCatalog() {
  return RETENTION_RULES.map((r) => ({
    id: r.id,
    layerId: r.layerId,
    class: r.class,
    reason: r.reason,
    maxRetentionMs: r.maxRetentionMs,
    retainsObservations: r.class === 'retain',
  }));
}

/**
 * Verdict for API responses — never invents a retain when unknown.
 * @param {string} feedOrLayer
 */
export function retentionVerdict(feedOrLayer) {
  const id = String(feedOrLayer || '');
  const asFeed = retentionForFeed(id);
  if (asFeed) {
    return {
      id: asFeed.id,
      layerId: asFeed.layerId,
      class: asFeed.class,
      retainsObservations: asFeed.class === 'retain',
      reason: asFeed.reason,
      maxRetentionMs: asFeed.maxRetentionMs,
    };
  }
  const asLayer = retentionRulesForLayer(id);
  if (asLayer.length) {
    const retain = mayRetainLayer(id);
    const forbid = asLayer.find((r) => r.class === 'forbid' || r.class === 'transient');
    return {
      id,
      layerId: id,
      class: retain ? 'retain' : forbid?.class || 'unknown',
      retainsObservations: retain,
      reason: retain
        ? asLayer
            .filter((r) => r.class === 'retain')
            .map((r) => r.reason)
            .join(' ')
        : forbid?.reason || 'No retain rule for this layer.',
      maxRetentionMs: retain
        ? Math.max(
            ...asLayer
              .filter((r) => r.class === 'retain' && r.maxRetentionMs)
              .map((r) => r.maxRetentionMs),
          )
        : null,
      rules: asLayer.map((r) => r.id),
    };
  }
  return {
    id,
    layerId: id || null,
    class: 'unknown',
    retainsObservations: false,
    reason: 'Unreviewed source — not retained until an explicit retain rule exists.',
    maxRetentionMs: null,
  };
}
