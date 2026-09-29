/**
 * Stage 5.1 — Incident workspace brief (PRODUCT_STANDARD / STAGE_PLAN 5.1).
 *
 * Assembles *related* nearby evidence for an event selection. Related ≠ causal:
 * every linked item is labelled with relation + provenance; nothing is invented.
 * Pure module: callers supply already-fetched catalogs (cameras, entities).
 */

import { EVENT_DETAIL_LAYERS } from './eventDetail.js';

export const INCIDENT_WORKSPACE_VERSION = 1;

/** Allowed event layer ids for a workspace brief. */
export const INCIDENT_EVENT_LAYERS = EVENT_DETAIL_LAYERS;

/**
 * Haversine distance in km. Returns null when coordinates are unusable.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 */
export function distanceKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * @typedef {{
 *   id: string,
 *   layerId: string,
 *   label?: string|null,
 *   latitude: number,
 *   longitude: number,
 *   observedAt?: string|null,
 *   classification?: string|null,
 *   provider?: string|null,
 *   sourceUrl?: string|null,
 *   note?: string|null,
 * }} IncidentSubject
 */

/**
 * Build a workspace brief for one event. Does not fetch; does not invent.
 *
 * @param {object} input
 * @param {IncidentSubject} input.subject Selected event (must have coords).
 * @param {Array<object>} [input.cameras] CCTV catalog rows with lat/lon/id.
 * @param {Array<object>} [input.flights] Flight-like rows with lat/lon/id.
 * @param {Array<object>} [input.alerts] Optional co-located alert rows.
 * @param {number} [input.radiusKm=50] Search radius; clamped 1–250.
 * @param {number} [input.limit=10] Max items per category; clamped 1–25.
 * @param {string} [input.builtAt] ISO timestamp; defaults to now.
 */
export function buildIncidentWorkspace({
  subject,
  cameras = [],
  flights = [],
  alerts = [],
  radiusKm = 50,
  limit = 10,
  builtAt,
} = {}) {
  if (!subject || typeof subject !== 'object') {
    return {
      ok: false,
      error: 'An event subject is required',
      code: 'SUBJECT_REQUIRED',
    };
  }
  if (!INCIDENT_EVENT_LAYERS.includes(subject.layerId)) {
    return {
      ok: false,
      error: `Layer "${subject.layerId}" is not an incident-workspace event layer`,
      code: 'LAYER_NOT_SUPPORTED',
    };
  }
  const lat = Number(subject.latitude);
  const lon = Number(subject.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      ok: false,
      error: 'Event has no usable coordinates; workspace not assembled',
      code: 'NO_COORDINATES',
    };
  }

  const r = Math.min(250, Math.max(1, Number(radiusKm) || 50));
  const lim = Math.min(25, Math.max(1, Math.floor(Number(limit) || 10)));
  const when = builtAt || new Date().toISOString();

  const pickNearby = (rows, mapRow) => {
    const scored = [];
    for (const row of rows || []) {
      const mapped = mapRow(row);
      if (!mapped) continue;
      const d = distanceKm(lat, lon, mapped.latitude, mapped.longitude);
      if (d == null || d > r) continue;
      scored.push({ ...mapped, distanceKm: Math.round(d * 10) / 10 });
    }
    scored.sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
    return scored.slice(0, lim);
  };

  const nearbyCameras = pickNearby(cameras, (cam) => {
    const clat = Number(cam.lat ?? cam.latitude);
    const clon = Number(cam.lon ?? cam.longitude);
    if (!cam?.id || !Number.isFinite(clat) || !Number.isFinite(clon)) return null;
    return {
      id: String(cam.id),
      label: cam.name || cam.label || String(cam.id),
      latitude: clat,
      longitude: clon,
      provider: cam.provider || cam.agency || null,
      mediaKind: cam.feedType || cam.mediaKind || null,
      relation: 'nearby',
      causal: false,
      note: 'Co-located camera in catalog — not evidence the event is visible in the frame',
    };
  });

  const nearbyFlights = pickNearby(flights, (f) => {
    const flat = Number(f.lat ?? f.latitude);
    const flon = Number(f.lon ?? f.longitude);
    if (!f?.id || !Number.isFinite(flat) || !Number.isFinite(flon)) return null;
    return {
      id: String(f.id),
      label: f.callsign || f.label || String(f.id),
      latitude: flat,
      longitude: flon,
      provider: f.provider || 'aircraft feed',
      relation: 'nearby',
      causal: false,
      note: 'Aircraft position near the event — proximity is not involvement',
    };
  });

  const relatedAlerts = pickNearby(alerts, (a) => {
    const alat = Number(a.lat ?? a.latitude);
    const alon = Number(a.lon ?? a.longitude);
    if (!a?.id || !Number.isFinite(alat) || !Number.isFinite(alon)) return null;
    return {
      id: String(a.id),
      label: a.event || a.headline || a.label || String(a.id),
      latitude: alat,
      longitude: alon,
      provider: a.provider || 'NWS / alert feed',
      relation: 'nearby',
      causal: false,
      note: 'Separate official alert near the subject — not proof of a single combined incident',
    };
  });

  return {
    ok: true,
    version: INCIDENT_WORKSPACE_VERSION,
    builtAt: when,
    disclaimer:
      'Related nearby evidence only. Related ≠ causal. Nothing here invents observations or merges unrelated events.',
    subject: {
      id: String(subject.id),
      layerId: subject.layerId,
      label: subject.label || null,
      latitude: lat,
      longitude: lon,
      observedAt: subject.observedAt || null,
      classification: subject.classification || null,
      provider: subject.provider || null,
      sourceUrl: subject.sourceUrl || null,
      note: subject.note || null,
    },
    radiusKm: r,
    nearby: {
      cameras: nearbyCameras,
      flights: nearbyFlights,
      alerts: relatedAlerts,
    },
    counts: {
      cameras: nearbyCameras.length,
      flights: nearbyFlights.length,
      alerts: relatedAlerts.length,
    },
    citations: [
      {
        role: 'subject',
        provider: subject.provider || subject.layerId,
        url: subject.sourceUrl || null,
        classification: subject.classification || null,
        retrievedAt: subject.observedAt || when,
      },
      ...nearbyCameras.slice(0, 3).map((c) => ({
        role: 'nearby-camera',
        provider: c.provider,
        id: c.id,
        relation: 'nearby',
        causal: false,
      })),
      ...nearbyFlights.slice(0, 3).map((f) => ({
        role: 'nearby-flight',
        provider: f.provider,
        id: f.id,
        relation: 'nearby',
        causal: false,
      })),
    ],
  };
}
