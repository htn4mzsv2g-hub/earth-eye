/**
 * NWS CAP weather alerts via api.weather.gov (U.S. public domain, keyless).
 * Requires a descriptive User-Agent per NWS API terms.
 *
 *   GET /api/nws-alerts         → normalized snapshot
 *   GET /api/nws-alerts/status  → cache / freshness
 *
 * Does not invent alerts. Features without geometry are kept with geometry:null
 * and areaDesc for honesty (zone-only products).
 */
import {
  readResponseJsonCapped,
  coalesceProxyRequest,
} from './common/http.js';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';

const MIB = 1024 * 1024;
const TTL_MS = 60_000;
const DEFAULT_AREA = ''; // empty = CONUS active (large); prefer state codes in prod

function userAgent() {
  return (
    process.env.NWS_USER_AGENT ||
    'EarthEye/1.0 (private hosted instance; +https://eartheye.us; weather alerts)'
  );
}

function upstreamUrl(area) {
  const params = new URLSearchParams({
    status: 'actual',
    message_type: 'alert',
  });
  if (area) params.set('area', area);
  return `https://api.weather.gov/alerts/active?${params}`;
}

/**
 * Normalize one NWS Feature into a stable Earth Eye alert record.
 * @param {object} feature
 */
export function normalizeNwsAlert(feature) {
  const props = feature?.properties || {};
  const id = String(props.id || feature?.id || '').trim();
  if (!id) return null;
  const onset = props.onset || props.effective || null;
  const ends = props.ends || props.expires || null;
  const expires = props.expires || null;
  return {
    id,
    event: String(props.event || 'Alert').trim(),
    severity: String(props.severity || 'Unknown').trim(),
    urgency: String(props.urgency || 'Unknown').trim(),
    certainty: String(props.certainty || 'Unknown').trim(),
    headline: props.headline ? String(props.headline).trim() : null,
    description: props.description ? String(props.description).slice(0, 4000) : null,
    instruction: props.instruction ? String(props.instruction).slice(0, 2000) : null,
    areaDesc: props.areaDesc ? String(props.areaDesc).trim() : null,
    onset,
    ends,
    expires,
    senderName: props.senderName ? String(props.senderName).trim() : 'NWS',
    status: String(props.status || 'Actual').trim(),
    sourceUrl: props['@id'] || `https://api.weather.gov/alerts/${encodeURIComponent(id)}`,
    geometry: feature?.geometry || null,
  };
}

export function nwsAlertsProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  let cache = null;
  let inFlight = null;
  const allow = makeRateLimiter({ windowMs: 60_000, max: 30, globalMax: 400 });

  async function refresh(area) {
    const url = upstreamUrl(area);
    const signal = AbortSignal.timeout(30_000);
    const response = await fetchImpl(url, {
      signal,
      redirect: 'error',
      headers: {
        Accept: 'application/geo+json',
        'User-Agent': userAgent(),
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`upstream_http_${response.status}`);
    }
    const payload = await readResponseJsonCapped(response, 8 * MIB, signal);
    const features = Array.isArray(payload?.features) ? payload.features : [];
    const alerts = [];
    for (const f of features) {
      const row = normalizeNwsAlert(f);
      if (row) alerts.push(row);
    }
    return {
      fetchedAt: new Date(now()).toISOString(),
      stale: false,
      ttlMs: TTL_MS,
      source: 'api.weather.gov/alerts/active',
      license: 'U.S. public domain (NWS / NOAA)',
      area: area || 'all',
      count: alerts.length,
      alerts,
    };
  }

  async function getSnapshot(area) {
    const age = cache ? now() - Date.parse(cache.fetchedAt) : Infinity;
    if (cache && age < TTL_MS && cache.area === (area || 'all')) {
      return { ...cache, stale: false };
    }
    if (!inFlight) {
      inFlight = refresh(area)
        .then((snap) => {
          cache = snap;
          return snap;
        })
        .catch((err) => {
          if (cache) {
            return { ...cache, stale: true, error: String(err?.message || err) };
          }
          throw err;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  return {
    name: 'nws-alerts-proxy',
    configureServer(server) {
      server.middlewares.use('/api/nws-alerts/status', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            hasCache: Boolean(cache),
            fetchedAt: cache?.fetchedAt || null,
            count: cache?.count || 0,
            stale: cache
              ? now() - Date.parse(cache.fetchedAt) >= TTL_MS
              : true,
            ttlMs: TTL_MS,
            source: 'api.weather.gov',
            license: 'U.S. public domain (NWS / NOAA)',
          }),
        );
      });

      server.middlewares.use('/api/nws-alerts', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        const key = clientKey(req);
        if (!allow(key)) {
          res.statusCode = 429;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'rate_limited' }));
          return;
        }
        try {
          const url = new URL(req.url || '/', 'http://local');
          const area = String(url.searchParams.get('area') || DEFAULT_AREA)
            .trim()
            .toUpperCase()
            .slice(0, 2);
          const snap = await coalesceProxyRequest('nws-alerts', () =>
            getSnapshot(area),
          );
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'public, max-age=30');
          res.end(JSON.stringify(snap));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'upstream_unavailable',
              detail: String(err?.message || err),
            }),
          );
        }
      });
    },
  };
}
