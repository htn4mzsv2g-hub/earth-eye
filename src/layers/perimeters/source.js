import { readResponseJsonCapped } from '../../sources/httpBody.js';

/** Request a normalized snapshot through the bounded, same-origin WFIGS proxy. */
export function createWfigsPerimeterSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getSnapshot({ signal, bbox = null } = {}) {
      signal?.throwIfAborted();
      const params = new URLSearchParams();
      if (
        bbox &&
        ['west', 'south', 'east', 'north'].every((key) =>
          Number.isFinite(Number(bbox[key])),
        )
      ) {
        params.set(
          'bbox',
          [bbox.west, bbox.south, bbox.east, bbox.north]
            .map((value) => Number(value).toFixed(4))
            .join(','),
        );
      }
      const response = await fetchImpl(
        `/api/fire-perimeters${params.size ? `?${params}` : ''}`,
        { signal },
      );
      if (!response.ok) throw new Error(`WFIGS HTTP ${response.status}`);
      const payload = await readResponseJsonCapped(
        response,
        80 * 1024 * 1024,
        signal,
      );
      signal?.throwIfAborted();
      if (!Array.isArray(payload?.rows))
        throw new Error('Malformed perimeter snapshot');
      return payload.rows;
    },
  };
}
