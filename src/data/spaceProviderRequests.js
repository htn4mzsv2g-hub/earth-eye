/** Fixed upstream request URLs; callers own validation, credentials and transport. */
export function celestrakTleUrl(group) {
  // Legacy TLE text (AMSAT fallback still uses two-line elements).
  const url = new URL('https://celestrak.org/NORAD/elements/gp.php');
  url.searchParams.set('GROUP', group);
  url.searchParams.set('FORMAT', 'tle');
  return url;
}

/** CelesTrak GP / OMM JSON (current recommended public format). */
export function celestrakGpUrl(group) {
  const url = new URL('https://celestrak.org/NORAD/elements/gp.php');
  url.searchParams.set('GROUP', group);
  url.searchParams.set('FORMAT', 'json');
  return url;
}

/**
 * True only for a CelesTrak GP catalog array.
 * HTML, empty arrays, and bare TLE text are rejected so a failed upstream
 * cannot be stored as if it were elements.
 * @param {string} body
 * @returns {boolean}
 */
export function isCelestrakGpBody(body) {
  const trimmed = String(body ?? '').trim();
  return (
    trimmed.startsWith('[') &&
    (trimmed.includes('"OBJECT_NAME"') ||
      trimmed.includes('"NORAD_CAT_ID"') ||
      trimmed.includes('"TLE_LINE1"'))
  );
}

export function launchLibraryRecentUrl(end) {
  const start = new Date(end.getTime() - 30 * 86400000);
  const url = new URL('https://ll.thespacedevs.com/2.3.0/launches/');
  url.searchParams.set('net__gte', start.toISOString());
  url.searchParams.set('net__lte', end.toISOString());
  url.searchParams.set('limit', '100');
  url.searchParams.set('mode', 'detailed');
  return url;
}
