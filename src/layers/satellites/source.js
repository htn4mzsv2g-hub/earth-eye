const GROUPS = new Set([
  'stations',
  'visual',
  'gps-ops',
  'glo-ops',
  'galileo',
  'geo',
  'starlink',
]);

/** Read catalog text from the existing group endpoint using a supplied transport. */
export function createSatelliteSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async readGroup(group, { signal } = {}) {
      if (!GROUPS.has(group)) throw new TypeError('Unknown satellite group');
      signal?.throwIfAborted();
      const response = await fetchImpl(`/api/celestrak/${group}`, { signal });
      const text = response.ok ? await response.text() : '';
      signal?.throwIfAborted();
      // Earth Eye: the proxy labels a non-CelesTrak fallback body.
      const tleSource = response.headers?.get?.('x-tle-source') || 'celestrak';
      // A real CelesTrak copy served from cache after an upstream failure is
      // a FALLBACK and carries its fetch time.
      const tleCache = response.headers?.get?.('x-tle-cache') || '';
      const fetchedAt = response.headers?.get?.('x-tle-fetched-at') || '';
      return {
        ok: response.ok,
        status: response.status,
        text,
        tleSource,
        tleCache,
        fetchedAt,
      };
    },
  };
}
