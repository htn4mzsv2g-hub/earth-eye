/**
 * TomTom routing adapter (Orbis free-tier API key).
 *
 * Uses TomTom Routing API calculateRoute under the developer-portal key that
 * unlocks Orbis free-tier quotas. Response projected to the same shape as
 * OSRM (`projectRouteResult` + optional steps) so Directions/annotations
 * stay provider-agnostic.
 *
 * No Google/Apple geometry. No Mapbox. No Waze. No simulated traffic.
 */
import { projectRouteResult } from '../../../src/data/placeProviderPayloads.js';
import { earthEyeUserAgent } from '../../hardening/outboundUa.js';

const TRAVEL_MODE = Object.freeze({
  car: 'car',
  foot: 'pedestrian',
  bike: 'bicycle',
});

/**
 * Build upstream URL (Routing API v1 — same key as Orbis free tier).
 * @param {{ pts: number[][], profile: string, key: string, withSteps: boolean }} opts
 * pts are [lon, lat]
 */
export function buildTomTomRouteUrl({ pts, profile, key, withSteps }) {
  const locs = pts
    .map(([lon, lat]) => `${lat},${lon}`)
    .join(':');
  const mode = TRAVEL_MODE[profile] || 'car';
  const params = new URLSearchParams({
    key,
    travelMode: mode,
    traffic: profile === 'car' ? 'true' : 'false',
    routeType: 'fastest',
    routeRepresentation: 'polyline',
    computeBestOrder: 'false',
  });
  if (withSteps) {
    params.set('instructionsType', 'text');
    params.set('language', 'en-US');
  }
  return `https://api.tomtom.com/routing/1/calculateRoute/${locs}/json?${params}`;
}

/**
 * Normalize TomTom guidance instructions → Directions step list shape.
 * @param {object} route TomTom route object
 */
export function normalizeTomTomSteps(route) {
  const instructions = route?.guidance?.instructions;
  if (!Array.isArray(instructions) || !instructions.length) {
    return { steps: [], truncated: false };
  }
  const MAX = 80;
  const truncated = instructions.length > MAX;
  const steps = instructions.slice(0, MAX).map((ins, i) => {
    const lat = Number(ins.point?.latitude);
    const lon = Number(ins.point?.longitude);
    return {
      index: i,
      distanceM: Number.isFinite(ins.routeOffsetInMeters)
        ? Math.max(0, Math.round(ins.routeOffsetInMeters))
        : null,
      durationS: Number.isFinite(ins.travelTimeInSeconds)
        ? Math.max(0, Math.round(ins.travelTimeInSeconds))
        : null,
      instruction: String(ins.message || ins.maneuver || 'Continue').trim(),
      name: String(ins.street || '').trim() || null,
      maneuver: String(ins.maneuver || '').trim() || null,
      location:
        Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null,
    };
  });
  return { steps, truncated };
}

/**
 * Extract [lon,lat][] geometry from TomTom route.
 * @param {object} route
 */
export function tomtomRouteGeometry(route) {
  const coords = [];
  const legs = Array.isArray(route?.legs) ? route.legs : [];
  for (const leg of legs) {
    for (const p of leg.points || []) {
      const lat = Number(p.latitude);
      const lon = Number(p.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lon, lat]);
    }
  }
  return coords;
}

/**
 * @param {{
 *   pts: number[][],
 *   profile: string,
 *   withSteps?: boolean,
 *   key: string,
 *   fetchImpl?: typeof fetch,
 *   signal?: AbortSignal,
 * }} opts
 */
export async function fetchTomTomRoute({
  pts,
  profile,
  withSteps = false,
  key,
  fetchImpl = fetch,
  signal,
}) {
  if (!key) {
    return {
      payload: null,
      error: 'NEEDS_KEY',
      provider: 'tomtom-orbis',
    };
  }
  const url = buildTomTomRouteUrl({ pts, profile, key, withSteps });
  const res = await fetchImpl(url, {
    signal,
    redirect: 'error',
    headers: {
      Accept: 'application/json',
      'User-Agent': earthEyeUserAgent('nav'),
    },
  });
  if (res.status === 429) {
    return {
      payload: null,
      error: 'routing service is rate limited',
      provider: 'tomtom-orbis',
      status: 429,
    };
  }
  if (res.status === 403 || res.status === 401) {
    return {
      payload: null,
      error: 'TomTom key refused by upstream',
      provider: 'tomtom-orbis',
      status: res.status,
    };
  }
  if (!res.ok) {
    return {
      payload: null,
      error: 'no route found',
      provider: 'tomtom-orbis',
      status: res.status,
    };
  }
  const body = await res.json();
  const route = body?.routes?.[0];
  const geometry = tomtomRouteGeometry(route);
  if (!geometry.length) {
    return {
      payload: null,
      error: 'no route found',
      provider: 'tomtom-orbis',
    };
  }
  const synthetic = {
    distance: Number(route.summary?.lengthInMeters) || 0,
    duration: Number(route.summary?.travelTimeInSeconds) || 0,
    geometry: { coordinates: geometry },
  };
  const payload = projectRouteResult(synthetic, profile);
  payload.provider = 'tomtom-orbis';
  payload.classification = 'LIVE';
  payload.attribution = 'Routing © TomTom';
  payload.demoFairUse = false;
  if (withSteps) {
    const { steps, truncated } = normalizeTomTomSteps(route);
    payload.steps = steps;
    if (truncated) payload.stepsTruncated = true;
  }
  return { payload, error: null, provider: 'tomtom-orbis' };
}
