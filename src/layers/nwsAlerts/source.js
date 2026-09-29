/**
 * NWS weather alerts feed via local /api/nws-alerts proxy (api.weather.gov).
 */
const DEFAULT_URL = '/api/nws-alerts';

export function createNwsAlertsSource({
  url = DEFAULT_URL,
  fetchImpl = (...args) => globalThis.fetch(...args),
  pollMs = 90_000,
} = {}) {
  let _snapshot = {
    fetchedAt: null,
    stale: true,
    count: 0,
    alerts: [],
    error: null,
  };
  let _timer = null;
  let _listeners = new Set();
  let _area = '';

  function notify() {
    for (const fn of _listeners) {
      try {
        fn(_snapshot);
      } catch {
        /* ignore */
      }
    }
  }

  async function refresh() {
    try {
      const q = _area ? `?area=${encodeURIComponent(_area)}` : '';
      const resp = await fetchImpl(`${url}${q}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const body = await resp.json();
      _snapshot = {
        fetchedAt: body.fetchedAt || new Date().toISOString(),
        stale: Boolean(body.stale),
        count: Array.isArray(body.alerts) ? body.alerts.length : 0,
        alerts: Array.isArray(body.alerts) ? body.alerts : [],
        license: body.license || 'U.S. public domain (NWS / NOAA)',
        source: body.source || 'api.weather.gov',
        error: body.error || null,
      };
    } catch (err) {
      _snapshot = {
        ..._snapshot,
        stale: true,
        error: String(err?.message || err),
      };
    }
    notify();
    return _snapshot;
  }

  return {
    id: 'weather-alerts',
    getSnapshot: () => _snapshot,
    subscribe(fn) {
      _listeners.add(fn);
      return () => _listeners.delete(fn);
    },
    setArea(area) {
      _area = String(area || '')
        .trim()
        .toUpperCase()
        .slice(0, 2);
    },
    async start() {
      await refresh();
      if (_timer) clearInterval(_timer);
      _timer = setInterval(() => {
        refresh().catch(() => {});
      }, pollMs);
    },
    stop() {
      if (_timer) clearInterval(_timer);
      _timer = null;
    },
    refresh,
  };
}
