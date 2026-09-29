/**
 * EE-EVENTS-1 Tier A — reuse existing EE upstreams; normalize via EE-EVENTS-0 adapters.
 * Bounded caps. Honest NEEDS KEY / OFFLINE / EMPTY / DEGRADED / RATE LIMITED.
 */

import { normalizeNwsAlert } from '../../nwsAlerts.js';
import { normalizeNwsAlertToWorldEvent } from '../../../../src/events/adapters/nwsAlert.js';
import { normalizeUsgsEarthquakeToWorldEvent } from '../../../../src/events/adapters/usgsEarthquake.js';
import { normalizeFirmsDetectionToWorldEvent } from '../../../../src/events/adapters/firmsDetection.js';
import { normalizeFirePerimeterToWorldEvent } from '../../../../src/events/adapters/firePerimeter.js';
import { normalizeCycloneToWorldEvent } from '../../../../src/events/adapters/cyclone.js';
import { parseCycloneStatus } from '../../cyclones.js';
import { normalizeFirePerimeterSnapshot } from '../../../../src/layers/perimeters/records.js';
import {
  parseFirmsCsv,
  filterTrailing24h,
  acquisitionMsUtc,
} from '../../../../src/data/firmsCsv.js';
import {
  emptyEventResult,
  needsKeyResult,
  offlineResult,
  rateLimitedResult,
  sourceHealthResult,
} from '../../../../src/events/worldEventContract.js';
import { readResponseJsonCapped, readResponseTextCapped } from '../../common/http.js';

const MIB = 1024 * 1024;
const UA =
  process.env.NWS_USER_AGENT ||
  'EarthEye/1.0 (private hosted instance; +https://eartheye.us; world-events)';

const CAPS = Object.freeze({
  nws: 200,
  usgs: 100,
  firms: 100,
  perimeters: 50,
  cyclones: 32,
});

function classifyHttpError(err, adapterId, source) {
  const msg = String(err?.message || err || '');
  if (/429|rate.?limit/i.test(msg))
    return rateLimitedResult({ adapterId, source, reason: msg });
  return offlineResult({ adapterId, source, reason: msg });
}

async function fetchJson(url, { fetchImpl, headers = {}, cap = 4 * MIB, timeoutMs = 25_000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  const res = await fetchImpl(url, {
    signal,
    redirect: 'error',
    headers: { Accept: 'application/json,application/geo+json', 'User-Agent': UA, ...headers },
  });
  if (res.status === 429) {
    await res.body?.cancel();
    const err = new Error('upstream_rate_limited');
    err.code = 429;
    throw err;
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`upstream_http_${res.status}`);
  }
  return readResponseJsonCapped(res, cap, signal);
}

/** NWS CAP active alerts (keyless). */
export async function fetchNwsWorldEvents({
  fetchImpl = fetch,
  now = () => Date.now(),
  max = CAPS.nws,
  area = '',
} = {}) {
  const adapterId = 'nws-alerts';
  const source = 'NWS';
  try {
    const params = new URLSearchParams({
      status: 'actual',
      message_type: 'alert',
    });
    if (area) params.set('area', String(area).trim().toUpperCase().slice(0, 2));
    const url = `https://api.weather.gov/alerts/active?${params}`;
    const payload = await fetchJson(url, { fetchImpl, cap: 8 * MIB });
    const features = Array.isArray(payload?.features) ? payload.features : [];
    const retrievedAt = new Date(now()).toISOString();
    const events = [];
    const errors = [];
    for (const f of features) {
      if (events.length >= max) break;
      const row = normalizeNwsAlert(f);
      if (!row) continue;
      try {
        const ev = normalizeNwsAlertToWorldEvent(row, { retrievedAt });
        if (ev) events.push(ev);
      } catch (err) {
        errors.push(String(err?.message || err));
      }
    }
    if (!events.length) {
      return {
        ...emptyEventResult({
          adapterId,
          reason: features.length
            ? 'Alerts present but none validated as World Events'
            : 'No active NWS alerts in scope (empty is not "nothing happened")',
          retrievedAt,
        }),
        count: 0,
        errors,
        tier: 'A',
      };
    }
    return {
      ...sourceHealthResult({
      adapterId,
      health: errors.length ? 'DEGRADED' : 'READY',
      reason: errors.length ? `${errors.length} normalize errors` : null,
      events,
      retrievedAt,
      errors,
    }),
      tier: 'A',
    };
  } catch (err) {
    const base = classifyHttpError(err, adapterId, source);
    return { ...base, tier: 'A' };
  }
}

/** USGS all_day GeoJSON (keyless, public domain). */
export async function fetchUsgsWorldEvents({
  fetchImpl = fetch,
  now = () => Date.now(),
  max = CAPS.usgs,
} = {}) {
  const adapterId = 'usgs-earthquakes';
  const source = 'USGS';
  try {
    const payload = await fetchJson(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
      { fetchImpl, cap: 6 * MIB },
    );
    const features = Array.isArray(payload?.features) ? payload.features : [];
    const retrievedAt = new Date(now()).toISOString();
    const events = [];
    const errors = [];
    for (const f of features) {
      if (events.length >= max) break;
      const id = String(f?.id || f?.properties?.code || '').trim();
      if (!id) continue;
      const coords = f?.geometry?.coordinates;
      try {
        const ev = normalizeUsgsEarthquakeToWorldEvent(
          {
            usgsId: id,
            lon: coords?.[0],
            lat: coords?.[1],
            depthKm: coords?.[2],
            mag: f?.properties?.mag,
            place: f?.properties?.place,
            time: f?.properties?.time,
          },
          { retrievedAt },
        );
        if (ev) events.push(ev);
      } catch (err) {
        errors.push(String(err?.message || err));
      }
    }
    if (!events.length) {
      return {
        ...emptyEventResult({
          adapterId,
          reason: 'No USGS earthquakes in feed scope (empty is not "nothing happened")',
          retrievedAt,
        }),
        count: 0,
        errors,
        tier: 'A',
      };
    }
    return {
      ...sourceHealthResult({
      adapterId,
      health: errors.length ? 'DEGRADED' : 'READY',
      reason: errors.length ? `${errors.length} normalize errors` : null,
      events,
      retrievedAt,
      errors,
    }),
      tier: 'A',
    };
  } catch (err) {
    return { ...classifyHttpError(err, adapterId, source), tier: 'A' };
  }
}

/** NASA FIRMS — NEEDS KEY when FIRMS_MAP_KEY unset; never invent detections. */
export async function fetchFirmsWorldEvents({
  fetchImpl = fetch,
  now = () => Date.now(),
  max = CAPS.firms,
  mapKey = process.env.FIRMS_MAP_KEY,
} = {}) {
  const adapterId = 'nasa-firms';
  const source = 'NASA FIRMS';
  const key = String(mapKey || '').trim();
  if (!key) {
    return {
      ...needsKeyResult({
        adapterId,
        source,
        reason: 'FIRMS_MAP_KEY not set; upstream not contacted.',
      }),
      tier: 'A',
    };
  }
  try {
    // Single source only (quota courtesy) — VIIRS NOAA-20 NRT world/1 day.
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_NOAA20_NRT/world/1`;
    const signal = AbortSignal.timeout(45_000);
    const res = await fetchImpl(url, { signal, redirect: 'error' });
    if (res.status === 429) {
      await res.body?.cancel();
      return { ...rateLimitedResult({ adapterId, source }), tier: 'A' };
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`upstream_http_${res.status}`);
    }
    const text = await readResponseTextCapped(res, 8 * MIB, signal);
    const records = parseFirmsCsv(text);
    if (records === null) throw new Error('non-CSV upstream response');
    const t0 = now();
    const recent = filterTrailing24h(records, t0);
    const retrievedAt = new Date(t0).toISOString();
    const events = [];
    const errors = [];
    for (const fire of recent) {
      if (events.length >= max) break;
      try {
        const acqMs = acquisitionMsUtc(fire.acqDate, fire.acqTime);
        const ev = normalizeFirmsDetectionToWorldEvent(
          { ...fire, acqMs: Number.isFinite(acqMs) ? acqMs : undefined },
          { retrievedAt },
        );
        if (ev) events.push(ev);
      } catch (err) {
        errors.push(String(err?.message || err));
      }
    }
    if (!events.length) {
      return {
        ...emptyEventResult({
          adapterId,
          reason: 'No FIRMS detections in trailing 24h sample (empty is not "nothing happened")',
          retrievedAt,
        }),
        count: 0,
        errors,
        tier: 'A',
      };
    }
    return {
      ...sourceHealthResult({
      adapterId,
      health: errors.length ? 'DEGRADED' : 'READY',
      reason: errors.length ? `${errors.length} normalize errors` : null,
      events,
      retrievedAt,
      errors,
    }),
      tier: 'A',
    };
  } catch (err) {
    return { ...classifyHttpError(err, adapterId, source), tier: 'A' };
  }
}

/** WFIGS perimeters (keyless). Global capped. */
export async function fetchPerimetersWorldEvents({
  fetchImpl = fetch,
  now = () => Date.now(),
  max = CAPS.perimeters,
} = {}) {
  const adapterId = 'wfigs-perimeters';
  const source = 'WFIGS';
  const API_URL =
    'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/' +
    'WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?' +
    new URLSearchParams({
      where: '1=1',
      outFields: [
        'poly_IncidentName',
        'attr_UniqueFireIdentifier',
        'attr_IncidentSize',
        'attr_PercentContained',
        'attr_POOState',
        'attr_IncidentTypeCategory',
        'attr_FireDiscoveryDateTime',
        'poly_DateCurrent',
        'attr_FireCause',
        'attr_POOCounty',
        'attr_IncidentComplexityLevel',
      ].join(','),
      maxAllowableOffset: '0.001',
      outSR: '4326',
      resultRecordCount: String(Math.min(max, 200)),
      f: 'geojson',
    }).toString();
  try {
    const payload = await fetchJson(API_URL, { fetchImpl, cap: 6 * MIB, timeoutMs: 40_000 });
    const rows = normalizeFirePerimeterSnapshot(payload) || [];
    const retrievedAt = new Date(now()).toISOString();
    const events = [];
    const errors = [];
    for (const row of rows) {
      if (events.length >= max) break;
      try {
        const ev = normalizeFirePerimeterToWorldEvent(row, { retrievedAt });
        if (ev) events.push(ev);
      } catch (err) {
        errors.push(String(err?.message || err));
      }
    }
    if (!events.length) {
      return {
        ...emptyEventResult({
          adapterId,
          reason: 'No WFIGS perimeters in current feed (empty is not "nothing happened")',
          retrievedAt,
        }),
        count: 0,
        errors,
        tier: 'A',
      };
    }
    return {
      ...sourceHealthResult({
      adapterId,
      health: errors.length ? 'DEGRADED' : 'READY',
      reason: errors.length ? `${errors.length} normalize errors` : null,
      events,
      retrievedAt,
      errors,
    }),
      tier: 'A',
    };
  } catch (err) {
    return { ...classifyHttpError(err, adapterId, source), tier: 'A' };
  }
}

/** NOAA / NHC active cyclones (keyless) — status JSON only (no GIS cone fetch here). */
export async function fetchCycloneWorldEvents({
  fetchImpl = fetch,
  now = () => Date.now(),
  max = CAPS.cyclones,
} = {}) {
  const adapterId = 'noaa-cyclones';
  const source = 'NOAA / NHC';
  try {
    const payload = await fetchJson(
      'https://www.nhc.noaa.gov/CurrentStorms.json',
      { fetchImpl, cap: 256 * 1024, timeoutMs: 15_000 },
    );
    const t0 = now();
    const storms = parseCycloneStatus(payload, t0).slice(0, max);
    const retrievedAt = new Date(t0).toISOString();
    const events = [];
    const errors = [];
    for (const storm of storms) {
      try {
        const ev = normalizeCycloneToWorldEvent(
          { ...storm, geometryStatus: storm.geometryStatus || 'pending' },
          { retrievedAt, source: 'NOAA / NHC' },
        );
        if (ev) events.push(ev);
      } catch (err) {
        errors.push(String(err?.message || err));
      }
    }
    if (!events.length) {
      return {
        ...emptyEventResult({
          adapterId,
          reason: 'No active NHC cyclones (empty is not "nothing happened")',
          retrievedAt,
        }),
        count: 0,
        errors,
        tier: 'A',
      };
    }
    return {
      ...sourceHealthResult({
      adapterId,
      health: errors.length ? 'DEGRADED' : 'READY',
      reason: errors.length ? `${errors.length} normalize errors` : null,
      events,
      retrievedAt,
      errors,
    }),
      tier: 'A',
    };
  } catch (err) {
    return { ...classifyHttpError(err, adapterId, source), tier: 'A' };
  }
}

export const TIER_A_CAPS = CAPS;
