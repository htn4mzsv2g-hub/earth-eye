import { makeRateLimiter, clientKey } from '../common/rate-limit.js';
import { haversineKm } from '../common/geo.js';
import { readResponseTextCapped } from '../common/http.js';
import { normalizeOsrmSteps } from '../../../src/data/routeSteps.js';
import {
  normalizeRouteProfile,
  projectRouteResult,
} from '../../../src/data/placeProviderPayloads.js';
import {
  resolveRouteProvider,
  routeProviderStatus,
  ROUTE_PROVIDER_IDS,
} from './routeProvider.js';
import { fetchTomTomRoute } from './tomtomOrbisRoute.js';
import { createTomTomMonthlyBudget } from './tomtomBudget.js';
import { earthEyeUserAgent } from '../../hardening/outboundUa.js';

/**
 * OSM routing (FOSSGIS OSRM) cache: profile|coords ->
 * { payload, hasSteps, cachedAt }. `hasSteps` records whether the upstream
 * call behind this entry asked for maneuvers, because an entry without them
 * cannot answer a request that wants them.
 */
const ROUTE_CACHE_MS = 600000;

/**
 * Upstream calls currently in flight, keyed by endpoint + route + step shape.
 * Two identical requests that arrive before the first one answers (three rapid
 * reroutes of the same A→B, a second browser tab) await the SAME upstream
 * fetch. The FOSSGIS servers ask for no heavy use; the cheapest way to honour
 * that is not to make the call twice. Module-level, because what it is
 * deduplicating is this process's outbound traffic — the endpoint is part of
 * the key, so two installations pointed at different services never share one.
 * @type {Map<string, Promise<{payload: object|null, error: string|null}>>}
 */
const _routeInflight = new Map();

/** Shared monthly TomTom free-tier governor (routing category). */
let _sharedTomTomBudget = null;
function tomtomBudget() {
  if (!_sharedTomTomBudget) _sharedTomTomBudget = createTomTomMonthlyBudget();
  return _sharedTomTomBudget;
}
export function _resetTomTomBudgetForTest() {
  _sharedTomTomBudget = null;
}


/** Hard cap on the OSRM route response we will buffer. */
const ROUTE_MAX_RESPONSE_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Minimum gap between two OUTBOUND route requests, across every client and
 * every profile. The FOSSGIS servers publish "one request per second max", and
 * the per-client rate limiter below cannot honour that on its own: two
 * different clients, or one client switching DRIVE to WALK, are two different
 * cache keys and left 48 ms apart upstream. This is the gate that makes the
 * app's outbound rate what the policy says it may be.
 */
export const ROUTE_UPSTREAM_MIN_INTERVAL_MS = 1000;

/**
 * How many requests may be waiting for that gate at once. Past this the answer
 * is an honest 429 rather than a queue that grows until everything times out.
 */
export const ROUTE_UPSTREAM_QUEUE_MAX = 8;

/** The interval actually in force; only a test ever shortens it. */
let _upstreamIntervalMs = ROUTE_UPSTREAM_MIN_INTERVAL_MS;

/** Earliest wall-clock time the next outbound request may leave. */
let _nextUpstreamAt = 0;
/** Requests currently holding or waiting for the outbound slot. */
let _upstreamQueueDepth = 0;

/** Thrown when the outbound queue is full; answered as a 429. */
class RouteBusyError extends Error {
  constructor(retryAfterMs) {
    super('routing busy');
    this.name = 'RouteBusyError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** Thrown when the routing service itself rate-limited us. */
class UpstreamRateLimitError extends Error {
  constructor(retryAfterSec) {
    super('routing service is rate limited');
    this.name = 'UpstreamRateLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

/**
 * Run one outbound request no sooner than the shared gate allows.
 * @template T
 * @param {() => Promise<T>} run The request.
 * @returns {Promise<T>}
 */
async function throughUpstreamGate(run) {
  if (_upstreamQueueDepth >= ROUTE_UPSTREAM_QUEUE_MAX) {
    throw new RouteBusyError(
      Math.max(0, _nextUpstreamAt - Date.now()) + _upstreamIntervalMs,
    );
  }
  _upstreamQueueDepth += 1;
  try {
    const now = Date.now();
    const slot = Math.max(now, _nextUpstreamAt);
    _nextUpstreamAt = slot + _upstreamIntervalMs;
    const wait = slot - now;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    return await run();
  } finally {
    _upstreamQueueDepth -= 1;
  }
}

/** Reject routes whose straight-line spans are obviously abusive (km). */
const ROUTE_MAX_LEG_KM = 600;

const ROUTE_MAX_TOTAL_KM = 2500;

const _routeRateLimiter = makeRateLimiter({
  windowMs: 60_000,
  max: 60,
  globalMax: 200,
});

/** Test seam: forget the outbound state this module keeps between requests. */
export function _resetRouteUpstreamForTest() {
  _routeInflight.clear();
  _nextUpstreamAt = 0;
  _upstreamQueueDepth = 0;
  _upstreamIntervalMs = ROUTE_UPSTREAM_MIN_INTERVAL_MS;
}

/**
 * Test seam: shorten the outbound gate so a queue-overflow test does not have
 * to wait out the real one-per-second policy. The policy value itself is
 * asserted separately.
 * @param {number} ms
 */
export function _setRouteUpstreamIntervalForTest(ms) {
  _upstreamIntervalMs =
    Number.isFinite(ms) && ms >= 0 ? ms : ROUTE_UPSTREAM_MIN_INTERVAL_MS;
}

/** Test seam: how many upstream calls are coalescing right now. */
export function _routeInflightCountForTest() {
  return _routeInflight.size;
}

/** Release a response body we are not going to read. */
async function cancelBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    /* already closed */
  }
}

/**
 * Fetch one route from the routing service and project it.
 * @param {object} request
 * @param {string} request.profile foot | car | bike
 * @param {string} request.osrmProfile Upstream profile name.
 * @param {string} request.base Endpoint base for this profile.
 * @param {string} request.coords `lon,lat;lon,lat[;...]`
 * @param {boolean} request.withSteps Ask upstream for maneuvers.
 * @param {Function} request.fetchImpl Injected request function.
 * @returns {Promise<{payload: object|null, error: string|null}>}
 */
async function fetchRoute({
  profile,
  osrmProfile,
  base,
  coords,
  withSteps,
  fetchImpl,
}) {
  // `steps` is opt-in per request. Asking for maneuvers on every call made the
  // response several times larger for the callers that never read them (the
  // voice route annotation, fly_route), on someone else's bandwidth.
  const upstream =
    `${base.replace(/\/$/, '')}/route/v1/${osrmProfile}/${coords}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=${withSteps ? 'true' : 'false'}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let osrm;
  try {
    const upstreamRes = await throughUpstreamGate(() =>
      fetchImpl(upstream, {
        signal: controller.signal,
        // The endpoint is configured above; a redirect is the one way out of
        // it, so it is refused rather than followed.
        redirect: 'error',
        headers: {
          'User-Agent': earthEyeUserAgent('places'),
        },
      }),
    );
    if (upstreamRes.status === 429) {
      await cancelBody(upstreamRes);
      const retryAfter = Number(upstreamRes.headers.get('retry-after'));
      throw new UpstreamRateLimitError(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5,
      );
    }
    if (!upstreamRes.ok) {
      await cancelBody(upstreamRes);
      return { payload: null, error: 'no route found' };
    }
    const ctype = upstreamRes.headers.get('content-type') || '';
    if (!ctype.includes('json')) {
      await cancelBody(upstreamRes);
      return { payload: null, error: 'no route found' };
    }
    const text = await readResponseTextCapped(
      upstreamRes,
      ROUTE_MAX_RESPONSE_BYTES,
    );
    osrm = JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
  const route = osrm?.routes?.[0];
  if (osrm?.code !== 'Ok' || !route?.geometry?.coordinates?.length)
    return { payload: null, error: 'no route found' };
  const payload = projectRouteResult(route, profile);
  if (withSteps) {
    const { steps, truncated } = normalizeOsrmSteps(route);
    payload.steps = steps;
    if (truncated) payload.stepsTruncated = true;
  }
  return { payload, error: null };
}

export function installRouteMiddleware(
  middlewares,
  {
    endpoints = {},
    fetchImpl = (...args) => fetch(...args),
    env = process.env,
    budget = null,
  } = {},
) {
  const _routeCache = new Map();
  const getBudget = () => budget || tomtomBudget();

  // NAV-2 status (no spend): which provider would handle routes + budget snapshot.
  middlewares.use('/api/route/status', (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return;
    }
    const snap = getBudget().snapshot();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(
      JSON.stringify({
        ok: true,
        ...routeProviderStatus(env),
        budget: snap,
      }),
    );
  });

  // GET /api/route?profile=foot|car|bike&coords=lon,lat;lon,lat[;...][&steps=1]
  // Provider: TomTom Orbis (keyed, car) or OSRM DEMO_FAIR_USE. Mapbox not wired.
  middlewares.use('/api/route', async (req, res) => {
    const fail = (msg) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: msg }));
    };
    const rateLimited = (msg, retryAfterSec) => {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, Math.round(retryAfterSec || 5))),
      });
      res.end(JSON.stringify({ ok: false, error: msg }));
    };
    try {
      if (!_routeRateLimiter(clientKey(req))) {
        rateLimited('rate limited', 5);
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      const raw = (url.searchParams.get('profile') || 'foot').toLowerCase();
      const profile = normalizeRouteProfile(raw);
      if (!profile) return fail('invalid profile');
      const osrmProfile = profile === 'car' ? 'driving' : profile;
      const pairs = (url.searchParams.get('coords') || '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      if (pairs.length < 2 || pairs.length > 12)
        return fail('need 2-12 coordinates');
      const clean = [];
      const pts = [];
      for (const pr of pairs) {
        const parts = pr.split(',');
        if (parts.length !== 2) return fail('invalid coordinate');
        const lon = Number(parts[0]);
        const lat = Number(parts[1]);
        if (
          !Number.isFinite(lon) ||
          !Number.isFinite(lat) ||
          Math.abs(lat) > 90 ||
          Math.abs(lon) > 180
        ) {
          return fail('invalid coordinate');
        }
        clean.push(`${lon},${lat}`);
        pts.push([lon, lat]);
      }
      // Reject obviously-abusive spans — a real walking/driving route is local,
      // so a cross-continent request is either a bug or an attempt to drive
      // heavy upstream OSRM work.
      let totalKm = 0;
      for (let i = 1; i < pts.length; i += 1) {
        // pts are [lon, lat]; existing haversineKm takes (lat1, lon1, lat2, lon2).
        const legKm = haversineKm(
          pts[i - 1][1],
          pts[i - 1][0],
          pts[i][1],
          pts[i][0],
        );
        if (legKm > ROUTE_MAX_LEG_KM) return fail('route leg too long');
        totalKm += legKm;
      }
      if (totalKm > ROUTE_MAX_TOTAL_KM) return fail('route too long');
      const coords = clean.join(';');
      const provider = resolveRouteProvider({ profile, env });
      const cacheKey = `${provider.id}|${profile}|${coords}`;
      const base =
        endpoints[profile] ||
        `https://routing.openstreetmap.de/routed-${profile}`;
      const now = Date.now();
      const wantSteps = url.searchParams.get('steps') === '1';
      const annotate = (payload) => {
        if (!payload || typeof payload !== 'object') return payload;
        return {
          ...payload,
          provider: payload.provider || provider.id,
          classification:
            payload.classification || provider.classification,
          attribution: payload.attribution || provider.attribution,
          demoFairUse:
            payload.demoFairUse !== undefined
              ? payload.demoFairUse
              : provider.demoFairUse,
          needsKey: Boolean(provider.needsKey),
        };
      };
      // A caller that did not ask for maneuvers never sees them, even when the
      // cached entry carries them for someone else.
      const shapePayload = (payload) => {
        const shaped = wantSteps ? payload : { ...payload, steps: undefined };
        return annotate(shaped);
      };
      const cached = _routeCache.get(cacheKey);
      if (
        cached &&
        now - cached.cachedAt <= ROUTE_CACHE_MS &&
        (!wantSteps || cached.hasSteps)
      ) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(shapePayload(cached.payload)));
        return;
      }
      const inflightKey = `${provider.id}|${base}|${cacheKey}|${wantSteps ? 's' : 'n'}`;
      // A stepless request can also ride a stepful call already in flight —
      // it just drops the maneuvers on the way out.
      let pending =
        _routeInflight.get(inflightKey) ||
        (wantSteps ? null : _routeInflight.get(`${provider.id}|${base}|${cacheKey}|s`));
      if (!pending) {
        if (provider.id === ROUTE_PROVIDER_IDS.TOMTOM_ORBIS) {
          const admission = getBudget().admit('routing');
          if (!admission.ok) {
            res.writeHead(429, {
              'Content-Type': 'application/json',
              'Retry-After': '3600',
              'Cache-Control': 'no-store',
            });
            res.end(
              JSON.stringify({
                ok: false,
                error: admission.error,
                note: admission.note,
                budget: admission.status,
                provider: provider.id,
                classification: 'BUDGET_EXCEEDED',
                needsKey: false,
              }),
            );
            return;
          }
          const key = String(env.TOMTOM_API_KEY || '').trim();
          pending = (async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 12000);
            try {
              const result = await fetchTomTomRoute({
                pts,
                profile,
                withSteps: wantSteps,
                key,
                fetchImpl,
                signal: controller.signal,
              });
              if (result.payload && !result.error) {
                getBudget().record('routing', 1);
                if (admission.warn) {
                  result.payload.budgetWarn = admission.note;
                }
              }
              return result;
            } finally {
              clearTimeout(timer);
            }
          })();
        } else {
          pending = fetchRoute({
            profile,
            osrmProfile,
            base,
            coords,
            withSteps: wantSteps,
            fetchImpl,
          }).then((result) => {
            if (result?.payload) {
              result.payload.provider = ROUTE_PROVIDER_IDS.OSRM_DEMO;
              result.payload.classification = provider.classification;
              result.payload.attribution = provider.attribution;
              result.payload.demoFairUse = true;
              result.payload.needsKey = Boolean(provider.needsKey);
            }
            return result;
          });
        }
        _routeInflight.set(inflightKey, pending);
        const settle = () => {
          if (_routeInflight.get(inflightKey) === pending)
            _routeInflight.delete(inflightKey);
        };
        pending.then(settle, settle);
      }
      let payload;
      let error;
      try {
        ({ payload, error } = await pending);
      } catch (upstreamError) {
        if (upstreamError instanceof RouteBusyError) {
          return rateLimited(
            'routing busy — too many routes at once',
            Math.ceil(upstreamError.retryAfterMs / 1000),
          );
        }
        if (upstreamError instanceof UpstreamRateLimitError) {
          // Reporting this as "no route found" would blame the map for
          // something the routing service said about us.
          return rateLimited(
            'routing service is rate limited',
            upstreamError.retryAfterSec,
          );
        }
        throw upstreamError;
      }
      if (error || !payload) return fail(error || 'no route found');
      _routeCache.set(cacheKey, {
        payload,
        hasSteps: Array.isArray(payload.steps),
        cachedAt: Date.now(),
      });
      if (_routeCache.size > 200)
        _routeCache.delete(_routeCache.keys().next().value);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(shapePayload(payload)));
    } catch (e) {
      console.error('[Route Proxy]', e?.message || e);
      fail('route proxy error');
    }
  });
}
