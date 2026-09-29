/**
 * Collection adapters — only approved, reviewed sources. No scrape.
 * Each returns { records, observedLatest } or throws.
 */
import { normalizeRecord } from '../../src/atlas/normalizeRecord.js';

const USGS_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

export async function fetchUsgsEarthquakes({ fetchImpl = fetch, signal } = {}) {
  const res = await fetchImpl(USGS_URL, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'earth-eye-collection/1.0 (private hosted instance; +https://eartheye.us)',
    },
  });
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
  const body = await res.json();
  const features = Array.isArray(body?.features) ? body.features : [];
  const retrievedAt = Date.now();
  const records = [];
  for (const f of features) {
    const id = String(f?.id || f?.properties?.code || '').trim();
    if (!id) continue;
    const coords = f?.geometry?.coordinates;
    const lon = Number(coords?.[0]);
    const lat = Number(coords?.[1]);
    const depth = Number(coords?.[2]);
    const observedAt = Number(f?.properties?.time) || null;
    const publishedAt = Number(f?.properties?.updated) || null;
    try {
      records.push(
        normalizeRecord({
          layerId: 'earthquakes',
          providerId: id,
          observedAt,
          publishedAt,
          retrievedAt,
          geometry:
            Number.isFinite(lon) && Number.isFinite(lat)
              ? { lon, lat, depthKm: Number.isFinite(depth) ? depth : null }
              : null,
          precision: 'approx',
          recordClass: 'observed',
          category: 'earthquake',
          units: 'magnitude',
          sourceUrl: f?.properties?.url || USGS_URL,
          quality: { mag: f?.properties?.mag ?? null },
          props: {
            place: f?.properties?.place || null,
            mag: f?.properties?.mag ?? null,
            magType: f?.properties?.magType || null,
            status: f?.properties?.status || null,
            tsunami: f?.properties?.tsunami || 0,
          },
        }),
      );
    } catch {
      /* quarantine malformed: skip */
    }
  }
  return { records, observedLatest: records[0]?.observedAt ?? null };
}

/** Adapter registry — only wired policies. */

/** NWS CAP active alerts → collection records (public domain). */
export async function fetchNwsAlerts({ fetchImpl = fetch, signal, policy } = {}) {
  const area = String(process.env.NWS_COLLECTION_AREA || '').trim();
  const params = new URLSearchParams({
    status: 'actual',
    message_type: 'alert',
  });
  if (area) params.set('area', area);
  const url = `https://api.weather.gov/alerts/active?${params}`;
  const res = await fetchImpl(url, {
    signal,
    headers: {
      Accept: 'application/geo+json',
      'User-Agent':
        process.env.NWS_USER_AGENT ||
        'earth-eye-collection/1.0 (private hosted instance; +https://eartheye.us)',
    },
  });
  if (!res.ok) throw new Error(`NWS HTTP ${res.status}`);
  const body = await res.json();
  const features = Array.isArray(body?.features) ? body.features : [];
  const retrievedAt = Date.now();
  const max = Number(policy?.maxRecords) || 800;
  const records = [];
  for (const f of features) {
    if (records.length >= max) break;
    const props = f?.properties || {};
    const id = String(props.id || f?.id || '').trim();
    if (!id) continue;
    const onset = props.onset || props.effective || null;
    const observedAt = onset ? Date.parse(onset) : null;
    const publishedAt = props.sent ? Date.parse(props.sent) : null;
    let geometry = null;
    const g = f?.geometry;
    if (g?.type === 'Point' && Array.isArray(g.coordinates)) {
      const lon = Number(g.coordinates[0]);
      const lat = Number(g.coordinates[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) geometry = { lon, lat };
    }
    try {
      records.push(
        normalizeRecord({
          layerId: 'weather-alerts',
          providerId: id,
          observedAt: Number.isFinite(observedAt) ? observedAt : null,
          publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
          retrievedAt,
          geometry,
          precision: geometry ? 'approx' : 'unknown',
          recordClass: 'reported',
          category: 'weather-alert',
          units: null,
          sourceUrl: props['@id'] || url,
          quality: {
            severity: props.severity || null,
            urgency: props.urgency || null,
          },
          props: {
            event: props.event || null,
            severity: props.severity || null,
            headline: props.headline ? String(props.headline).slice(0, 400) : null,
            areaDesc: props.areaDesc ? String(props.areaDesc).slice(0, 400) : null,
            senderName: props.senderName || 'NWS',
          },
        }),
      );
    } catch {
      /* quarantine malformed */
    }
  }
  return { records, observedLatest: records[0]?.observedAt ?? null };
}

export const ADAPTERS = Object.freeze({
  'usgs-geojson': fetchUsgsEarthquakes,
  'nws-alerts': fetchNwsAlerts,
  // Cyclones / FIRMS reuse existing proxies in a later tick; stubs refuse rather
  // than scrape. They stay scheduled but report "adapter deferred" until wired.
  'nhc-current': async () => {
    const err = new Error(
      'adapter deferred: use /api/cyclones until Stage 4 wire',
    );
    err.code = 'adapter-deferred';
    throw err;
  },
  'firms-csv': async () => {
    const err = new Error(
      'adapter deferred: use /api/firms until Stage 4 wire',
    );
    err.code = 'adapter-deferred';
    throw err;
  },
});
