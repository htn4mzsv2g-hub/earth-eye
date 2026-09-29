/**
 * Stage 5.3 — Read permitted observation history (no invention).
 * Empty feeds return empty arrays + honest notes, never fabricated rows.
 */
import {
  listRetentionCatalog,
  mayRetainFeed,
  retentionForFeed,
  retentionVerdict,
} from './retentionPolicy.js';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function parseUrl(req) {
  const raw = String(req.url || '/');
  const qIdx = raw.indexOf('?');
  const pathPart = (qIdx >= 0 ? raw.slice(0, qIdx) : raw).replace(
    /^\/api\/atlas\/permitted-history\/?/,
    '',
  );
  const query = new URLSearchParams(qIdx >= 0 ? raw.slice(qIdx + 1) : '');
  const parts = pathPart.split('/').filter(Boolean);
  return { feedId: parts[0] || query.get('feed') || null, query };
}

/**
 * @param {{ getScheduler: () => { store: object, status: Function } | null }} deps
 */
export function createPermittedHistoryMiddleware({ getScheduler }) {
  return function permittedHistoryMiddleware(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, { ok: false, error: 'Method not allowed' });
    }
    const sched = getScheduler?.();
    const { feedId, query } = parseUrl(req);
    const limit = Math.min(
      500,
      Math.max(1, Number(query.get('limit')) || 100),
    );

    const catalog = listRetentionCatalog();
    const retainFeeds = catalog.filter((c) => c.retainsObservations);

    if (!feedId) {
      const counts = {};
      if (sched?.store) {
        for (const f of retainFeeds) {
          counts[f.id] = sched.store.count(f.id);
        }
      }
      return send(res, 200, {
        ok: true,
        mode: 'catalog',
        note: 'Replay/history only for feeds with retainsObservations=true. Empty counts mean no retained observations yet — not “nothing happened”.',
        retainsObservations: true,
        forbidden: catalog.filter((c) => !c.retainsObservations),
        permitted: retainFeeds,
        recordCounts: counts,
        continuous: sched?.status?.()?.continuousClaim ?? null,
      });
    }

    const verdict = retentionVerdict(feedId);
    if (!mayRetainFeed(feedId) && !mayRetainFeed(verdict.id)) {
      // Also allow lookup by layerId → first retain feed for that layer.
      const byLayer = retainFeeds.find((f) => f.layerId === feedId);
      if (!byLayer) {
        return send(res, 403, {
          ok: false,
          error: 'retention_forbidden',
          verdict,
          records: [],
          note: 'This source is not permitted for durable observation history.',
        });
      }
      return serveFeed(res, sched, byLayer.id, limit);
    }

    return serveFeed(res, sched, feedId, limit);
  };
}

function serveFeed(res, sched, feedId, limit) {
  const rule = retentionForFeed(feedId);
  if (!rule || rule.class !== 'retain') {
    return send(res, 403, {
      ok: false,
      error: 'retention_forbidden',
      verdict: retentionVerdict(feedId),
      records: [],
    });
  }
  if (!sched?.store) {
    return send(res, 200, {
      ok: true,
      feedId,
      layerId: rule.layerId,
      retainsObservations: true,
      reason: rule.reason,
      maxRetentionMs: rule.maxRetentionMs,
      records: [],
      count: 0,
      note: 'Collection scheduler not running; no retained observations available.',
    });
  }
  const records = sched.store.list(feedId, { limit });
  return send(res, 200, {
    ok: true,
    feedId,
    layerId: rule.layerId,
    retainsObservations: true,
    reason: rule.reason,
    maxRetentionMs: rule.maxRetentionMs,
    records,
    count: records.length,
    totalStored: sched.store.count(feedId),
    note:
      records.length === 0
        ? 'No retained observations for this feed yet (gap or not collected). Not an invention of empty events.'
        : undefined,
  });
}

export function installPermittedHistoryRoutes(server, { getScheduler }) {
  const mw = createPermittedHistoryMiddleware({ getScheduler });
  server.middlewares.use('/api/atlas/permitted-history', mw);
}
