/**
 * GDELT DOC 2.0 — NEWS REPORT discovery only (Tier C).
 * Terms allow commercial use with citation. Never promote to OFFICIAL ALERT.
 * Never invent precise points from city-level geography.
 */

import { normalizeGdeltArticleToWorldEvent } from '../../../../src/events/adapters/gdelt.js';
import {
  emptyEventResult,
  offlineResult,
  rateLimitedResult,
  sourceHealthResult,
} from '../../../../src/events/worldEventContract.js';
import { readResponseJsonCapped } from '../../common/http.js';

const UA =
  'EarthEye/1.0 (private hosted instance; +https://eartheye.us; world-events; citation: GDELT Project)';
const MAX = 25;

export async function fetchGdeltWorldEvents({
  fetchImpl = fetch,
  now = () => Date.now(),
  max = MAX,
  query = '(earthquake OR wildfire OR "tropical cyclone" OR hurricane OR flood OR volcano OR tsunami)',
} = {}) {
  const adapterId = 'gdelt';
  const source = 'GDELT';
  const params = new URLSearchParams({
    query: String(query).slice(0, 400),
    mode: 'artlist',
    format: 'json',
    maxrecords: String(Math.min(max, 50)),
    sort: 'datedesc',
    timespan: '24h',
  });
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;

  try {
    const signal = AbortSignal.timeout(18_000);
    const res = await fetchImpl(url, {
      signal,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'User-Agent': UA,
      },
    });
    if (res.status === 429) {
      await res.body?.cancel();
      return {
        ...rateLimitedResult({
          adapterId,
          source,
          reason: 'GDELT rate limited (known intermittent 429)',
        }),
        tier: 'C',
      };
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`upstream_http_${res.status}`);
    }
    const payload = await readResponseJsonCapped(res, 2 * 1024 * 1024, signal);
    const articles = Array.isArray(payload?.articles) ? payload.articles : [];
    const retrievedAt = new Date(now()).toISOString();
    const events = [];
    const errors = [];
    for (const article of articles) {
      if (events.length >= max) break;
      try {
        const ev = normalizeGdeltArticleToWorldEvent(article, { retrievedAt });
        if (ev) {
          // Hard authenticity: NEWS REPORT only; region/unknown only.
          if (ev.kind !== 'NEWS REPORT') continue;
          if (ev.precision === 'point') continue;
          events.push(ev);
        }
      } catch (err) {
        errors.push(String(err?.message || err));
      }
    }
    if (!events.length) {
      return {
        ...emptyEventResult({
          adapterId,
          reason:
            'No GDELT news matches in timespan (empty is not "nothing happened"; news ≠ sensor facts)',
          retrievedAt,
        }),
        count: 0,
        errors,
        tier: 'C',
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
      tier: 'C',
    };
  } catch (err) {
    const msg = String(err?.message || err);
    if (/429|rate/i.test(msg)) {
      return {
        ...rateLimitedResult({ adapterId, source, reason: msg }),
        tier: 'C',
      };
    }
    return {
      ...offlineResult({ adapterId, source, reason: msg }),
      tier: 'C',
    };
  }
}
