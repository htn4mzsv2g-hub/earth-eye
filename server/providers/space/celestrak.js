import path from 'node:path';
import { promises as fsp } from 'node:fs';
import {
  celestrakGpUrl,
  celestrakTleUrl,
} from '../../../src/data/spaceProviderRequests.js';

/**
 * Vite plugin: CelesTrak TLE proxy.
 *
 * CelesTrak does not send CORS headers, so this middleware fetches
 * satellite TLE data server-side and forwards it to the browser.
 * Upstream URL: https://celestrak.org/NORAD/elements/gp.php
 *
 * @returns {import('vite').Plugin}
 */
/**
 * CelesTrak GP/TLE proxy with a memory + disk cache.
 * Upstream: https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=json (OMM); AMSAT fallback remains TLE text
 * CelesTrak asks clients not to re-fetch GP data more than ~every 2 h and
 * throttles offenders; every dev reload used to refetch every group. Cache TTL
 * 6 h; on upstream failure the freshest stale OMM/TLE copy is served (a stale
 * catalog beats an empty satellites layer). Pattern mirrors openSkyProxy's
 * cache+serve-stale. Adapted from skylight's TleStore (MIT).
 * Honesty: primary path is CelesTrak GP FORMAT=json (OMM). AMSAT TLE fallback
 * is opt-in (TLE_AMSAT_FALLBACK=1) and labeled x-tle-source=amsat-fallback.
 */
export function celestrakProxy() {
  // ISO time for the x-tle-fetched-at header; an empty value if the clock
  // is unusable (never fails the TLE response itself).
  const isoTime = (ms) => {
    try {
      return new Date(ms).toISOString();
    } catch {
      return '';
    }
  };
  const TLE_TTL_MS = 6 * 3600_000;
  const CACHE_DIR = path.join(process.cwd(), '.gev-cache');
  const mem = new Map(); // group -> { at: epochMs, body: string }
  const inflight = new Map(); // group -> Promise<{at, body}|null>

  const diskPath = (group) => path.join(CACHE_DIR, `celestrak-${group}.json`);

  async function readDisk(group) {
    try {
      const parsed = JSON.parse(await fsp.readFile(diskPath(group), 'utf8'));
      if (typeof parsed?.body === 'string' && Number.isFinite(parsed?.at))
        return parsed;
    } catch {
      /* no disk cache yet */
    }
    return null;
  }

  async function writeDisk(group, entry) {
    try {
      await fsp.mkdir(CACHE_DIR, { recursive: true });
      await fsp.writeFile(diskPath(group), JSON.stringify(entry), 'utf8');
    } catch (err) {
      console.warn('[celestrak-proxy] cache write failed');
    }
  }

  async function fetchUpstream(group) {
    const url = celestrakGpUrl(group);
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(20000),
      // CelesTrak 403s bulk groups (e.g. `active`) unless the request carries a
      // descriptive User-Agent with a contact point.
      headers: {
        'User-Agent':
          'earth-eye-celestrak-proxy/1.0 (private hosted instance; +https://eartheye.us; based on +https://github.com/bilawalsidhu/gods-eye-view)',
        Accept: 'application/json,text/plain,*/*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    const trimmed = body.trim();
    // Prefer OMM JSON (FORMAT=json). TLE text is only accepted from the AMSAT
    // fallback path — never invent elements. Reject HTML/error pages.
    const isOmmJson =
      (trimmed.startsWith('[') || trimmed.startsWith('{')) &&
      (trimmed.includes('"OBJECT_NAME"') ||
        trimmed.includes('"NORAD_CAT_ID"') ||
        trimmed.includes('"TLE_LINE1"'));
    const isTleText = /^1 /m.test(body) && /^2 /m.test(body);
    if (!isOmmJson && !isTleText) {
      throw new Error('no OMM JSON or TLE lines in response');
    }
    return { at: Date.now(), body, format: isOmmJson ? 'omm-json' : 'tle' };
  }

  // Earth Eye: a keyless, clearly-labelled fallback for the `stations` group
  // when CelesTrak cannot be reached (some networks reset TLS to celestrak.org).
  // AMSAT publishes current two-line elements for amateur satellites and the
  // ISS. It is NOT a CelesTrak mirror: coverage is ~100 objects, so the
  // response carries `x-tle-source: amsat-fallback` and the layer reads
  // FALLBACK. Other groups (GPS, GEO, ...) have no fallback and stay failed.
  //
  // Data-honesty pass (2026-09): satellites are CelesTrak-or-unavailable by
  // default. The AMSAT fallback only runs when TLE_AMSAT_FALLBACK=1.
  const amsatFallbackEnabled = () =>
    ['1', 'true', 'yes', 'on'].includes(
      String(process.env.TLE_AMSAT_FALLBACK || '')
        .trim()
        .toLowerCase(),
    );
  const AMSAT_FALLBACK_GROUPS = new Set(['stations']);
  const AMSAT_URL = 'https://www.amsat.org/tle/current/nasabare.txt';
  let amsatEntry = null;
  async function fetchAmsatFallback() {
    if (amsatEntry && Date.now() - amsatEntry.at < TLE_TTL_MS)
      return amsatEntry;
    const res = await fetch(AMSAT_URL, {
      signal: AbortSignal.timeout(20000),
      headers: {
        'User-Agent':
          'earth-eye-tle-fallback/1.0 (private hosted instance; +https://eartheye.us)',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    if (!/^1 /m.test(body)) throw new Error('no TLE lines in AMSAT response');
    amsatEntry = { at: Date.now(), body };
    return amsatEntry;
  }

  const installMiddleware = (server) => {
    server.middlewares.use('/api/celestrak', async (req, res) => {
      const group = String(req.url || '')
        .replace(/^\//, '')
        .split('?')[0];
      if (!/^[a-z0-9-]+$/i.test(group)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('invalid group');
        return;
      }
      const send = (
        status,
        body,
        cacheStatus,
        tleSource = 'celestrak',
        fetchedAt = 0,
      ) => {
        // Guard against a double-send (e.g. a throw AFTER a response already
        // went out routing into the catch's send): writeHead after headersSent
        // throws "Cannot set headers after they are sent".
        if (res.headersSent) return;
        const contentType =
          typeof body === 'string' && body.trim().startsWith('[')
            ? 'application/json'
            : 'text/plain';
        res.writeHead(status, {
          'Content-Type': contentType,
          'x-tle-cache': cacheStatus,
          'x-tle-source': tleSource,
          'x-orbit-format':
            typeof body === 'string' && body.trim().startsWith('[')
              ? 'omm-json'
              : 'tle',
          // When the upstream copy was fetched, so a stale body shows its age.
          ...(fetchedAt ? { 'x-tle-fetched-at': isoTime(fetchedAt) } : {}),
        });
        res.end(body);
      };
      try {
        const now = Date.now();
        let entry = mem.get(group);
        if (!entry) {
          entry = await readDisk(group);
          if (entry) mem.set(group, entry);
        }
        if (entry && now - entry.at < TLE_TTL_MS) {
          send(200, entry.body, 'HIT', 'celestrak', entry.at);
          return;
        }
        // Stale or missing → refresh, single-flight per group.
        if (!inflight.has(group)) {
          inflight.set(
            group,
            fetchUpstream(group)
              .then(async (fresh) => {
                mem.set(group, fresh);
                await writeDisk(group, fresh);
                return fresh;
              })
              .catch((err) => {
                console.warn(
                  '[celestrak-proxy] refresh failed — serving cache if any',
                );
                return null;
              })
              .finally(() => inflight.delete(group)),
          );
        }
        const fresh = await inflight.get(group);
        if (fresh) {
          send(200, fresh.body, 'MISS', 'celestrak', fresh.at);
        } else if (entry) {
          send(200, entry.body, 'STALE-ERROR', 'celestrak', entry.at); // upstream down — real CelesTrak copy, labeled FALLBACK with its age
        } else if (amsatFallbackEnabled() && AMSAT_FALLBACK_GROUPS.has(group)) {
          try {
            const fallback = await fetchAmsatFallback();
            send(200, fallback.body, 'FALLBACK', 'amsat-fallback', fallback.at);
          } catch {
            send(502, 'celestrak fetch failed and no cache available', 'NONE');
          }
        } else {
          send(502, 'celestrak fetch failed and no cache available', 'NONE');
        }
      } catch (err) {
        console.error('[celestrak-proxy] request failed');
        send(500, 'celestrak proxy error', 'ERROR');
      }
    });
  };
  return {
    name: 'celestrak-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}
