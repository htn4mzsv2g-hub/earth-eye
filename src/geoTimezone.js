/**
 * Coarse lat/lon → IANA timezone for HUD / globe-local clocks.
 * Prefer political IANA zones (DST-aware) over longitude/15 fixed offsets.
 * Austin (≈30.3N, 97.7W) must resolve to America/Chicago, never UTC−7.
 */

/** @typedef {{id:string, lat0:number, lat1:number, lon0:number, lon1:number}} ZoneBox */

/** Ordered first-match boxes (more specific first). */
const ZONE_BOXES = Object.freeze([
  // Hawaii / Alaska
  { id: 'Pacific/Honolulu', lat0: 18.5, lat1: 22.5, lon0: -161, lon1: -154 },
  { id: 'America/Anchorage', lat0: 51, lat1: 72, lon0: -170, lon1: -130 },
  // Arizona (no DST) — before Denver band
  { id: 'America/Phoenix', lat0: 31.3, lat1: 37.0, lon0: -114.9, lon1: -109.0 },
  // Contiguous US (approx political bands; Central includes Texas/Austin)
  { id: 'America/New_York', lat0: 24.0, lat1: 49.5, lon0: -85.0, lon1: -66.5 },
  { id: 'America/Chicago', lat0: 25.5, lat1: 49.5, lon0: -104.0, lon1: -85.0 },
  { id: 'America/Denver', lat0: 31.0, lat1: 49.5, lon0: -114.0, lon1: -104.0 },
  { id: 'America/Los_Angeles', lat0: 32.0, lat1: 49.5, lon0: -125.0, lon1: -114.0 },
  // Canada (coarse)
  { id: 'America/Toronto', lat0: 41.5, lat1: 63, lon0: -85, lon1: -52 },
  { id: 'America/Winnipeg', lat0: 48, lat1: 60, lon0: -104, lon1: -85 },
  { id: 'America/Edmonton', lat0: 48, lat1: 60, lon0: -120, lon1: -104 },
  { id: 'America/Vancouver', lat0: 48, lat1: 60, lon0: -140, lon1: -120 },
  // Mexico / Central America
  { id: 'America/Mexico_City', lat0: 14, lat1: 33, lon0: -118, lon1: -86 },
  // South America
  { id: 'America/Sao_Paulo', lat0: -35, lat1: 5, lon0: -75, lon1: -34 },
  { id: 'America/Argentina/Buenos_Aires', lat0: -56, lat1: -21, lon0: -74, lon1: -53 },
  // Europe / Africa
  { id: 'Europe/London', lat0: 49, lat1: 61, lon0: -11, lon1: 2 },
  { id: 'Europe/Paris', lat0: 36, lat1: 55, lon0: -10, lon1: 15 },
  { id: 'Europe/Berlin', lat0: 47, lat1: 55, lon0: 5, lon1: 15 },
  { id: 'Europe/Moscow', lat0: 41, lat1: 70, lon0: 27, lon1: 60 },
  { id: 'Africa/Cairo', lat0: 22, lat1: 32, lon0: 24, lon1: 37 },
  { id: 'Africa/Johannesburg', lat0: -35, lat1: -22, lon0: 16, lon1: 33 },
  // Middle East / Asia / Oceania
  { id: 'Asia/Dubai', lat0: 22, lat1: 27, lon0: 51, lon1: 57 },
  { id: 'Asia/Kolkata', lat0: 6, lat1: 36, lon0: 68, lon1: 98 },
  { id: 'Asia/Shanghai', lat0: 18, lat1: 54, lon0: 97, lon1: 123 },
  { id: 'Asia/Tokyo', lat0: 24, lat1: 46, lon0: 123, lon1: 146 },
  { id: 'Asia/Seoul', lat0: 33, lat1: 39, lon0: 124, lon1: 132 },
  { id: 'Australia/Sydney', lat0: -44, lat1: -10, lon0: 112, lon1: 154 },
  { id: 'Pacific/Auckland', lat0: -48, lat1: -34, lon0: 166, lon1: 179 },
]);

/**
 * @param {number} latDeg
 * @param {number} lonDeg
 * @returns {string} IANA timezone id
 */
export function ianaTimezoneAt(latDeg, lonDeg) {
  const lat = Number(latDeg);
  const lon = Number(lonDeg);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'UTC';
  for (const box of ZONE_BOXES) {
    if (lat >= box.lat0 && lat <= box.lat1 && lon >= box.lon0 && lon <= box.lon1)
      return box.id;
  }
  // Ocean / uncovered land: pick nearest standard meridian zone via Etc/GMT.
  // Etc/GMT signs are inverted relative to ISO offsets (Etc/GMT+6 = UTC−6).
  const hours = Math.round(lon / 15);
  const clamped = Math.max(-12, Math.min(12, hours));
  if (clamped === 0) return 'UTC';
  return clamped > 0 ? `Etc/GMT-${clamped}` : `Etc/GMT+${-clamped}`;
}

/**
 * Short local-zone tag for the HUD (e.g. "CDT", "GMT-5", "UTC").
 * Always derived from an IANA zone via Intl — never longitude/15 alone.
 * @param {number} latDeg
 * @param {number} lonDeg
 * @param {Date|number} [when]
 * @returns {string}
 */
export function localTimezoneTag(latDeg, lonDeg, when = Date.now()) {
  const zone = ianaTimezoneAt(latDeg, lonDeg);
  if (zone === 'UTC') return 'UTC';
  const date = when instanceof Date ? when : new Date(when);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'short',
    }).formatToParts(date);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (name && name !== 'GMT' && name !== 'UTC')
      return name.replace(/^GMT/, 'UTC');
    const offsetParts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const off = offsetParts.find((p) => p.type === 'timeZoneName')?.value;
    if (off) {
      const normalized = off.replace(/^GMT/, 'UTC');
      if (normalized === 'UTC+0' || normalized === 'UTC-0') return 'UTC';
      return normalized;
    }
  } catch {
    /* invalid zone — fall through */
  }
  return zone;
}
