/**
 * EE-EVENTS-1/2 — World Events status + read-only list API.
 *
 * GET /api/atlas/world-events/status  — registry + per-source live health
 * GET /api/atlas/world-events         — validated events (session-gated in prod)
 *
 * Client globe markers / filters / disclosure: src/events/live (EE-EVENTS-2).
 * No fabricated events. No full detail panel (EE-EVENTS-3).
 */

import { createWorldEventsOrchestrator } from './orchestrator.js';
import { makeRateLimiter, clientKey } from '../common/rate-limit.js';

export function atlasWorldEvents({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  const orch = createWorldEventsOrchestrator({ fetchImpl, now });
  const allow = makeRateLimiter({ windowMs: 60_000, max: 40, globalMax: 600 });

  const install = (server) => {
    // Single mount so /status and / never hang or double-match oddly.
    server.middlewares.use('/api/atlas/world-events', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');

      const raw = String(req.url || '/');
      let pathname = '/';
      let search = '';
      try {
        const u = new URL(raw, 'http://local');
        pathname = u.pathname || '/';
        search = u.search || '';
      } catch {
        pathname = raw.split('?')[0] || '/';
        search = raw.includes('?') ? `?${raw.split('?')[1]}` : '';
      }
      const isStatus =
        pathname === '/status' ||
        pathname === '/status/' ||
        pathname.endsWith('/status');

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        return res.end(JSON.stringify({ error: 'Method not allowed' }));
      }

      if (isStatus) {
        try {
          const payload = await orch.status();
          res.statusCode = 200;
          return res.end(JSON.stringify(payload));
        } catch (err) {
          res.statusCode = 502;
          return res.end(
            JSON.stringify({
              ok: false,
              health: 'OFFLINE',
              error: 'world_events_status_failed',
              detail: String(err?.message || err),
            }),
          );
        }
      }

      // Exact list path only (/, "", empty). Reject unknown subpaths.
      if (pathname !== '/' && pathname !== '') {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: 'not_found' }));
      }

      const key = clientKey(req);
      if (!allow(key)) {
        res.statusCode = 429;
        return res.end(
          JSON.stringify({
            ok: false,
            health: 'RATE LIMITED',
            error: 'rate_limited',
          }),
        );
      }
      try {
        const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
        const payload = await orch.listEvents({
          source: params.get('source') || null,
          kind: params.get('kind') || null,
          limit: params.get('limit') ? Number(params.get('limit')) : 200,
        });
        res.statusCode = 200;
        return res.end(JSON.stringify(payload));
      } catch (err) {
        res.statusCode = 502;
        return res.end(
          JSON.stringify({
            ok: false,
            health: 'OFFLINE',
            error: 'world_events_unavailable',
            detail: String(err?.message || err),
          }),
        );
      }
    });
  };

  return {
    name: 'atlas-world-events',
    configureServer: install,
    configurePreviewServer: install,
  };
}

export { createWorldEventsOrchestrator };
