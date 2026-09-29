/**
 * EE-LIVE-3 — LIVE EARTH startup preset (pure selection + status copy).
 *
 * Enables a SMALL set of high-signal, low-cost existing EE sources for the
 * current view. Never invents activity; empty/honest failure states are fine.
 * Does not build a World Events stack and does not enable every layer.
 */

import { viewScaleForAltitude } from '../data/detectionPolicy.js';

/** Candidate order = progressive enable order (cheapest / most global first). */
export const LIVE_EARTH_CANDIDATES = Object.freeze([
  Object.freeze({
    id: 'earthquakes',
    label: 'USGS earthquakes',
    cost: 'low',
    scales: Object.freeze(['global', 'regional', 'metro', 'city', 'street']),
    region: 'world',
  }),
  Object.freeze({
    id: 'weather-cyclones',
    label: 'NOAA active cyclones',
    cost: 'low',
    scales: Object.freeze(['global', 'regional']),
    region: 'world',
  }),
  Object.freeze({
    id: 'weather-alerts',
    label: 'NWS alerts',
    cost: 'low',
    scales: Object.freeze(['regional', 'metro', 'city', 'street']),
    region: 'conus',
  }),
  Object.freeze({
    id: 'fire-perimeters',
    label: 'Fire perimeters',
    cost: 'medium',
    scales: Object.freeze(['regional', 'metro', 'city', 'street']),
    region: 'conus',
  }),
  Object.freeze({
    id: 'flights',
    label: 'Aircraft',
    cost: 'medium',
    // Avoid worldwide OpenSky client pulls at pure globe altitude.
    scales: Object.freeze(['metro', 'city', 'street']),
    region: 'world',
  }),
  Object.freeze({
    id: 'cctv',
    label: 'Public cameras',
    cost: 'high',
    scales: Object.freeze(['city', 'street']),
    region: 'world',
    // List ranking is viewport-bounded (EE-LIVE-4), but layer init still loads
    // the full multi-provider catalog into memory/entities. Keep auto-start off
    // until a nearby-scoped catalog load exists — do not load global blindly.
    autoStart: false,
    skipCompact: true,
  }),
]);

/** Approximate contiguous US + nearshore (for NWS / WFIGS relevance). */
export function isOverConus(latDeg, lonDeg) {
  const lat = Number(latDeg);
  const lon = Number(lonDeg);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
}

/**
 * Coarse US state postal for NWS `area=` (viewport-bounded alerts).
 * Empty string = do not fetch CONUS-wide (too costly); caller skips alerts.
 * @param {number} latDeg
 * @param {number} lonDeg
 * @returns {string} Two-letter state or ''
 */
export function usStateForAlerts(latDeg, lonDeg) {
  if (!isOverConus(latDeg, lonDeg)) return '';
  const lat = Number(latDeg);
  const lon = Number(lonDeg);
  // Minimal first-match boxes — enough for Austin/TX and common CONUS views.
  const boxes = [
    ['TX', 25.8, 36.5, -106.7, -93.4],
    ['OK', 33.6, 37.0, -103.0, -94.4],
    ['LA', 28.9, 33.1, -94.1, -88.8],
    ['NM', 31.3, 37.0, -109.1, -103.0],
    ['CA', 32.5, 42.1, -124.5, -114.1],
    ['AZ', 31.3, 37.0, -114.9, -109.0],
    ['CO', 37.0, 41.0, -109.1, -102.0],
    ['FL', 24.4, 31.1, -87.7, -79.9],
    ['NY', 40.4, 45.1, -79.8, -71.8],
    ['PA', 39.7, 42.3, -80.6, -74.7],
    ['IL', 36.9, 42.6, -91.6, -87.0],
    ['WA', 45.5, 49.1, -124.8, -116.9],
    ['OR', 41.9, 46.3, -124.6, -116.5],
  ];
  for (const [code, lat0, lat1, lon0, lon1] of boxes) {
    if (lat >= lat0 && lat <= lat1 && lon >= lon0 && lon <= lon1) return code;
  }
  // Over CONUS but outside the short list: still skip CONUS-wide dump.
  return '';
}

/**
 * Whether LIVE EARTH should claim an empty startup (not share / not saved layers).
 * @param {{hasShareState?: boolean, source?: string, enabledLayerIds?: Iterable<string>}} input
 */
export function shouldApplyLiveEarthPreset({
  hasShareState = false,
  source = 'defaults',
  enabledLayerIds = [],
} = {}) {
  if (hasShareState) return false;
  if (source === 'share' || source === 'legacy-share') return false;
  const enabled = [...(enabledLayerIds || [])].filter(Boolean);
  if (enabled.length > 0) return false;
  return source === 'defaults';
}

/**
 * Pick the small LIVE EARTH set for the current camera / device.
 * @param {{altitudeM?: number, latitude?: number, longitude?: number, compact?: boolean, optedOutIds?: Iterable<string>}} input
 * @returns {string[]} Layer ids in progressive enable order.
 */
export function selectLiveEarthSources({
  altitudeM,
  latitude,
  longitude,
  compact = false,
  optedOutIds = [],
} = {}) {
  const scale = viewScaleForAltitude(altitudeM);
  const opted = new Set([...(optedOutIds || [])].map(String));
  const overConus = isOverConus(latitude, longitude);
  const selected = [];
  for (const candidate of LIVE_EARTH_CANDIDATES) {
    if (candidate.autoStart === false) continue;
    if (opted.has(candidate.id)) continue;
    if (!candidate.scales.includes(scale)) continue;
    if (candidate.skipCompact && compact) continue;
    if (candidate.region === 'conus') {
      if (!overConus) continue;
      if (
        candidate.id === 'weather-alerts' &&
        !usStateForAlerts(latitude, longitude)
      )
        continue;
    }
    selected.push(candidate.id);
  }
  return selected;
}

/**
 * Compact status chip copy. Never invents busy activity counts.
 * @param {{active?: number, unavailable?: number, loading?: boolean}} input
 * @returns {string}
 */
export function formatLiveEarthChip({
  active = 0,
  unavailable = 0,
  loading = false,
} = {}) {
  const a = Math.max(0, Math.floor(Number(active) || 0));
  const u = Math.max(0, Math.floor(Number(unavailable) || 0));
  if (loading && a === 0 && u === 0) return 'LIVE EARTH · STARTING';
  return `LIVE EARTH · ${a} SOURCES ACTIVE · ${u} UNAVAILABLE`;
}

/**
 * Classify one manager layer row for the chip.
 * @param {{enabled?: boolean, lifecycleState?: string, stats?: object}|null} layer
 * @returns {'active'|'unavailable'|'loading'|'off'}
 */
export function classifyLiveEarthSource(layer) {
  if (!layer) return 'unavailable';
  const err =
    layer.stats?.error ||
    layer.stats?.lastError ||
    layer.stats?.managerRefreshError;
  if (err) return 'unavailable';
  if (!layer.enabled && layer.lifecycleState !== 'enabling') return 'off';
  if (
    layer.lifecycleState === 'enabling' ||
    layer.stats?.loading === true ||
    layer.stats?.refreshing === true
  )
    return 'loading';
  if (layer.stats?.unavailable === true || layer.stats?.available === false)
    return 'unavailable';
  if (layer.enabled || layer.lifecycleState === 'enabled') return 'active';
  return 'unavailable';
}

/**
 * Summarize chip counts for the LIVE EARTH candidate set that was attempted.
 * @param {Iterable<string>} attemptedIds
 * @param {(id: string) => object|null} getLayer
 */
export function summarizeLiveEarthStatus(attemptedIds, getLayer) {
  let active = 0;
  let unavailable = 0;
  let loading = false;
  for (const id of attemptedIds || []) {
    const state = classifyLiveEarthSource(getLayer?.(id) || null);
    if (state === 'active') active += 1;
    else if (state === 'unavailable') unavailable += 1;
    else if (state === 'loading') loading = true;
  }
  return {
    active,
    unavailable,
    loading,
    label: formatLiveEarthChip({ active, unavailable, loading }),
  };
}
