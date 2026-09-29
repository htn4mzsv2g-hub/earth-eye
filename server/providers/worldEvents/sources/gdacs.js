/**
 * GDACS live fetch (Tier B) — public API, attribute GDACS.
 * Bounded pagesize. No scrape.
 */

import { normalizeGdacsFeatureToWorldEvent } from '../../../../src/events/adapters/gdacs.js';
import {
  emptyEventResult,
  offlineResult,
  rateLimitedResult,
  sourceHealthResult,
} from '../../../../src/events/worldEventContract.js';
import { readResponseJsonCapped } from '../../common/http.js';

const UA =
  'EarthEye/1.0 (private hosted instance; +https://eartheye.us; world-events; attribution: GDACS)';
const MAX = 50;

function daysAgoIso(days, nowMs) {
  const d = new Date(nowMs - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export async function fetchGdacsWorldEvents({
  fetchImpl = fetch,
  now = () => Date.now(),
  max = MAX,
  lookbackDays = 7,
} = {}) {
  const adapterId = 'gdacs';
  const source = 'GDACS';
  const t0 = now();
  const fromdate = daysAgoIso(lookbackDays, t0);
  const todate = new Date(t0).toISOString().slice(0, 10);
  const url =
    'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?' +
    new URLSearchParams({
      fromdate,
      todate,
      alertlevel: 'red;orange;green',
      pagesize: String(Math.min(max, 100)),
      pagenumber: '1',
    }).toString();

  try {
    const signal = AbortSignal.timeout(25_000);
    const res = await fetchImpl(url, {
      signal,
      redirect: 'error',
      headers: {
        Accept: 'application/json,application/geo+json',
        'User-Agent': UA,
      },
    });
    if (res.status === 429) {
      await res.body?.cancel();
      return {
        ...rateLimitedResult({ adapterId, source }),
        tier: 'B',
      };
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`upstream_http_${res.status}`);
    }
    const payload = await readResponseJsonCapped(res, 4 * 1024 * 1024, signal);
    const features = Array.isArray(payload?.features)
      ? payload.features
      : Array.isArray(payload)
        ? payload
        : [];
    const retrievedAt = new Date(t0).toISOString();
    const events = [];
    const errors = [];
    for (const feature of features) {
      if (events.length >= max) break;
      try {
        const ev = normalizeGdacsFeatureToWorldEvent(feature, { retrievedAt });
        if (ev) events.push(ev);
      } catch (err) {
        errors.push(String(err?.message || err));
      }
    }
    if (!events.length) {
      return {
        ...emptyEventResult({
          adapterId,
          reason:
            'No GDACS events in lookback window (empty is not "nothing happened")',
          retrievedAt,
        }),
        count: 0,
        errors,
        tier: 'B',
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
      tier: 'B',
    };
  } catch (err) {
    const msg = String(err?.message || err);
    return {
      ...offlineResult({ adapterId, source, reason: msg }),
      tier: 'B',
    };
  }
}
