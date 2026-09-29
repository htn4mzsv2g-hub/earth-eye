/**
 * EE-EVENTS-2 — Browser client for /api/atlas/world-events (read-only).
 * Discrete LOADING → terminal health. Never endless SYNCING.
 */

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   listUrl?: string,
 *   statusUrl?: string,
 *   now?: () => number,
 * }} [opts]
 */
export function createWorldEventsClient({
  fetchImpl = (...args) => globalThis.fetch(...args),
  listUrl = '/api/atlas/world-events',
  statusUrl = '/api/atlas/world-events/status',
  now = () => Date.now(),
} = {}) {
  let cache = null;
  let phase = 'idle'; // idle | loading | ready | error
  let lastError = null;
  let inflight = null;

  async function getJson(url) {
    const res = await fetchImpl(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      const err = new Error(
        body?.error || body?.detail || `HTTP ${res.status}`,
      );
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  /**
   * Fetch events list (bounded). Reuses in-flight promise.
   * @param {{force?: boolean, source?: string|null, kind?: string|null, limit?: number}} [opts]
   */
  async function list(opts = {}) {
    const { force = false, source = null, kind = null, limit = 200 } = opts;
    if (!force && cache && phase === 'ready') return cache;
    if (inflight && !force) return inflight;

    phase = 'loading';
    lastError = null;
    const params = new URLSearchParams();
    if (source) params.set('source', source);
    if (kind) params.set('kind', kind);
    if (limit) params.set('limit', String(limit));
    const q = params.toString();
    const url = q ? `${listUrl}?${q}` : listUrl;

    inflight = (async () => {
      try {
        const body = await getJson(url);
        cache = Object.freeze({
          ok: body?.ok !== false,
          health: body?.health || 'NO DATA',
          generatedAt: body?.generatedAt || new Date(now()).toISOString(),
          count: Array.isArray(body?.events) ? body.events.length : 0,
          events: Object.freeze([...(body?.events || [])]),
          sources: Object.freeze([...(body?.sources || [])]),
          note: body?.note || null,
          fetchedAt: now(),
        });
        phase = 'ready';
        lastError = null;
        return cache;
      } catch (err) {
        phase = 'error';
        lastError = String(err?.message || err);
        // Keep prior cache if any — degraded honesty, not silent wipe.
        if (cache) {
          return Object.freeze({
            ...cache,
            ok: false,
            health: 'DEGRADED',
            staleError: lastError,
          });
        }
        cache = Object.freeze({
          ok: false,
          health: 'OFFLINE',
          generatedAt: new Date(now()).toISOString(),
          count: 0,
          events: Object.freeze([]),
          sources: Object.freeze([]),
          note: null,
          error: lastError,
          fetchedAt: now(),
        });
        return cache;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  async function status() {
    try {
      return await getJson(statusUrl);
    } catch (err) {
      return {
        ok: false,
        health: 'OFFLINE',
        error: String(err?.message || err),
        sources: [],
      };
    }
  }

  function getPhase() {
    return phase;
  }

  function getCache() {
    return cache;
  }

  function getLastError() {
    return lastError;
  }

  return {
    list,
    status,
    getPhase,
    getCache,
    getLastError,
  };
}
