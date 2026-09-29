/**
 * Earth Eye canonical information architecture (EE-LIVE-2 / Live World Phase 2).
 *
 * Destinations are semantic contracts shared by mobile and desktop. Layout may
 * differ; labels and ownership of surfaces must not.
 *
 *   GLOBE   — map / layers / search / location / context
 *   TRACK   — aircraft / military / vessels / satellites / launches / nearby
 *   CAMERAS — catalog / viewer / filters
 *   ANALYST — Ask / evidence / actions
 *   MORE    — scenes / visual / display / sources / provider health /
 *             keys (owner-only) / licenses / safety / account
 */

export const CANONICAL_DESTINATIONS = Object.freeze([
  Object.freeze({
    id: 'globe',
    label: 'GLOBE',
    owns: Object.freeze([
      'map',
      'layers',
      'search',
      'location',
      'context',
      'world-events',
    ]),
  }),
  Object.freeze({
    id: 'track',
    label: 'TRACK',
    owns: Object.freeze([
      'aircraft',
      'military',
      'vessels',
      'satellites',
      'launches',
      'nearby',
    ]),
  }),
  Object.freeze({
    id: 'cameras',
    label: 'CAMERAS',
    owns: Object.freeze(['catalog', 'viewer', 'filters']),
  }),
  Object.freeze({
    id: 'analyst',
    label: 'ANALYST',
    owns: Object.freeze(['ask', 'evidence', 'actions']),
  }),
  Object.freeze({
    id: 'more',
    label: 'MORE',
    owns: Object.freeze([
      'scenes',
      'visual',
      'display',
      'sources',
      'provider-health',
      'keys-owner-only',
      'licenses',
      'safety',
      'account',
    ]),
  }),
]);

/** Desktop dock primary buttons → panel / action mapping. */
export const DESKTOP_PRIMARY = Object.freeze([
  Object.freeze({
    dest: 'globe',
    label: 'GLOBE',
    open: 'explore',
    title: 'Globe: search, location, and map context (layers stay on the map rail)',
  }),
  Object.freeze({
    dest: 'track',
    label: 'TRACK',
    open: 'track',
    title: 'Track: aircraft, military, vessels, satellites, launches, nearby',
  }),
  Object.freeze({
    dest: 'cameras',
    label: 'CAMERAS',
    open: 'cctv',
    title: 'Cameras: public catalog, viewer, filters',
  }),
  Object.freeze({
    dest: 'analyst',
    label: 'ANALYST',
    open: 'analyst',
    title: 'Analyst: Ask, evidence, and map actions',
  }),
]);

/**
 * Desktop MORE drawer items (same destinations as mobile MORE).
 * Keys stays listed; UI hides or sanitizes for non-owner.
 */
export const DESKTOP_MORE_ITEMS = Object.freeze([
  Object.freeze({
    kind: 'open',
    id: 'events',
    label: 'EVENTS',
    title: 'World Events: globe markers, filters, source + time disclosure',
  }),
  Object.freeze({
    kind: 'open',
    id: 'feeds',
    label: 'SOURCES',
    title: 'Data sources and provider health',
  }),
  Object.freeze({
    kind: 'open',
    id: 'keys',
    label: 'KEYS',
    title: 'Provider capability / keys (owner detail; others see sanitized status)',
    ownerPreferred: true,
  }),
  Object.freeze({
    kind: 'open',
    id: 'credits',
    label: 'LICENSES',
    title: 'Attribution and licences',
  }),
  Object.freeze({
    kind: 'open',
    id: 'safety',
    label: 'SAFETY',
    title: 'Data limits and safe use',
  }),
  Object.freeze({
    kind: 'action',
    id: 'snapshot',
    label: 'SNAP',
    title: 'Save a PNG snapshot of the globe',
  }),
  Object.freeze({
    kind: 'action',
    id: 'tour',
    label: 'TOUR',
    title: 'Cinematic tour',
  }),
]);

export function canonicalLabels() {
  return CANONICAL_DESTINATIONS.map((d) => d.label);
}

export function destinationOwning(surface) {
  const key = String(surface || '').toLowerCase();
  return (
    CANONICAL_DESTINATIONS.find((d) => d.owns.includes(key))?.id ?? null
  );
}
