/**
 * Shared selection → detail contract (FINAL_BUILD_DIRECTIVE 2026-09-29).
 * Cyclone Polo P0 established: marker tap publishes context AND opens detail.
 * Event layers (fires, quakes, perimeters, cyclones) must use this path so
 * mobile sheets / Analyst / tracked readout stay consistent.
 */

export const EVENT_DETAIL_LAYERS = Object.freeze([
  'weather-cyclones',
  'local-firms',
  'earthquakes',
  'fire-perimeters',
  'weather-alerts',
]);

/** Ask the shell to open the appropriate detail surface for an event. */
export function requestEventDetail(layerId, extra = {}) {
  if (!EVENT_DETAIL_LAYERS.includes(layerId)) return false;
  try {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function')
      return false;
    const detail = { layerId, ...extra };
    const EventCtor =
      typeof window.CustomEvent === 'function'
        ? window.CustomEvent
        : typeof CustomEvent === 'function'
          ? CustomEvent
          : null;
    if (EventCtor) {
      window.dispatchEvent(new EventCtor('gev:event-detail-request', { detail }));
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Honest temporal bucket for event metadata. Never invents freshness. */
export function temporalStatusFromAgeMs(ageMs, { staleAfterMs = 36e5 } = {}) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown';
  if (ageMs > staleAfterMs) return 'stale';
  return 'current';
}
