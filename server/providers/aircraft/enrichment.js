import path from 'node:path';
import { promises as fsp } from 'node:fs';
/**
 * adsbdb.com enrichment proxy: callsign → route (airline + origin/destination
 * airports) and hex → aircraft type/registration.
 *
 * Stage 5.3: route data credits forbid copying into other databases — routes
 * stay in a process-memory TTL only and are NEVER written to disk. Aircraft
 * type/registration may use a short disk cache (separate from routes).
 */
export function adsbdbProxy() {
  const TTL_MS = 24 * 3600_000;
  const CACHE_PATH = path.join(process.cwd(), '.gev-cache', 'adsbdb.json');
  /** @type {{ routes: Record<string, {at:number,data:any}>, aircraft: Record<string, {at:number,data:any}> }} */
  let cache = { routes: {}, aircraft: {} };
  let dirty = false;
  let loaded = false;
  const inflight = new Map();

  async function loadOnce() {
    if (loaded) return;
    loaded = true;
    try {
      const parsed = JSON.parse(await fsp.readFile(CACHE_PATH, 'utf8'));
      // Intentionally drop any legacy routes blob — must not re-persist.
      cache = { routes: {}, aircraft: parsed.aircraft ?? {} };
    } catch {
      /* first run */
    }
    setInterval(async () => {
      if (!dirty) return;
      dirty = false;
      try {
        await fsp.mkdir(path.dirname(CACHE_PATH), { recursive: true });
        // Aircraft only — never routes.
        await fsp.writeFile(
          CACHE_PATH,
          JSON.stringify({ aircraft: cache.aircraft }),
          'utf8',
        );
      } catch {
        dirty = true;
      }
    }, 15_000).unref?.();
  }

  const fresh = (e) => e && Date.now() - e.at < TTL_MS;

  function parseRoute(json) {
    const fr = json?.response?.flightroute;
    if (!fr?.origin || !fr?.destination) return null;
    const airport = (a) => ({
      code: a.iata_code || a.icao_code || '',
      name: a.municipality || a.name || '',
      lat: Number.isFinite(a.latitude) ? a.latitude : null,
      lon: Number.isFinite(a.longitude) ? a.longitude : null,
    });
    return {
      airline: fr.airline?.name || null,
      origin: airport(fr.origin),
      destination: airport(fr.destination),
    };
  }

  function parseAircraft(json) {
    const a = json?.response?.aircraft;
    if (!a) return null;
    return {
      typeCode: a.icao_type || null,
      typeName:
        a.manufacturer && a.type
          ? `${a.manufacturer} ${a.type}`
          : a.type || null,
      registration: a.registration || null,
    };
  }

  function lookup(kind, key) {
    const store = kind === 'route' ? cache.routes : cache.aircraft;
    if (fresh(store[key])) return Promise.resolve(store[key].data);
    const ik = `${kind}:${key}`;
    if (!inflight.has(ik)) {
      inflight.set(
        ik,
        (async () => {
          try {
            const url =
              kind === 'route'
                ? `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(key)}`
                : `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(key)}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
              const data =
                kind === 'route'
                  ? parseRoute(await res.json())
                  : parseAircraft(await res.json());
              store[key] = { at: Date.now(), data };
              // Persist aircraft only; routes stay memory-only.
              if (kind === 'aircraft') dirty = true;
              return data;
            }
            if (res.status === 404) {
              store[key] = { at: Date.now(), data: null };
              if (kind === 'aircraft') dirty = true;
            }
            return fresh(store[key]) ? store[key].data : null;
          } catch {
            return fresh(store[key]) ? store[key].data : null;
          } finally {
            inflight.delete(ik);
          }
        })(),
      );
    }
    return inflight.get(ik);
  }

  const installMiddleware = (server) => {
    server.middlewares.use('/api/adsbdb', async (req, res) => {
      await loadOnce();
      const send = (status, obj) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      try {
        const [, kind, rawKey] = String(req.url || '')
          .split('?')[0]
          .split('/');
        if (kind === 'route') {
          const cs = String(rawKey || '').toUpperCase();
          if (!/^[A-Z0-9]{2,8}$/.test(cs))
            return send(400, { error: 'invalid callsign' });
          const data = await lookup('route', cs);
          return send(200, data ? { found: true, ...data } : { found: false });
        }
        if (kind === 'type') {
          const hex = String(rawKey || '').toLowerCase();
          if (!/^[0-9a-f]{6}$/.test(hex))
            return send(400, { error: 'invalid hex' });
          const data = await lookup('aircraft', hex);
          return send(200, data ? { found: true, ...data } : { found: false });
        }
        return send(404, { error: 'unknown endpoint' });
      } catch (err) {
        console.error('[adsbdb-proxy] request failed');
        return send(500, { error: 'adsbdb proxy error' });
      }
    });
  };
  return {
    name: 'adsbdb-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
    /** Test seam: inspect whether routes would be persisted. */
    _test: {
      routesPersistToDisk: false,
      cachePath: CACHE_PATH,
      getCache: () => cache,
    },
  };
}
