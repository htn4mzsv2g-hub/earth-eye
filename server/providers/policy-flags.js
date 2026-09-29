/**
 * Earth Eye server-side policy flags.
 *
 * EE_COMMERCIAL_SAFE=1 is the ONE commercial-safe switch. When it is on, the
 * server refuses every dataset whose licence does not affirmatively allow
 * commercial use (non-commercial CCTV packs such as the ALERTCalifornia /
 * HPWREN fire cameras, OpenSky, Open-Meteo, Google News RSS) and reports the
 * mode on GET /api/atlas/policy so the browser disables the matching layers
 * (src/atlas/dataSourceRegistry.js setCommercialSafeMode). Off by default:
 * Earth Eye is a private, non-commercial instance.
 */

/** @param {Record<string,string|undefined>} [env] */
export function commercialSafeMode(env = process.env) {
  return String(env?.EE_COMMERCIAL_SAFE ?? '').trim() === '1';
}

/** Server-side services that are off in commercial-safe mode, and why. */
export const COMMERCIAL_RESTRICTED_SERVICES = Object.freeze({
  opensky: 'OpenSky Network terms: non-commercial research/education only.',
  'open-meteo': 'Open-Meteo free API: non-commercial use only.',
  'google-news-rss': 'Google News RSS: personal, non-commercial use only.',
});

/** True when a named server service must refuse in commercial-safe mode. */
export function serviceBlockedByCommercialSafe(name, env = process.env) {
  return (
    commercialSafeMode(env) &&
    Object.hasOwn(COMMERCIAL_RESTRICTED_SERVICES, name)
  );
}
