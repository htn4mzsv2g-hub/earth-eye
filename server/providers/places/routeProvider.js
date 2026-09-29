/**
 * Pluggable route provider selection (NAV-2).
 * TomTom Orbis free-tier when TOMTOM_API_KEY is set; else OSRM DEMO_FAIR_USE.
 * Mapbox is NOT wired. Google/Apple/Waze forbidden for Cesium route geometry.
 */

export const ROUTE_PROVIDER_IDS = Object.freeze({
  OSRM_DEMO: 'osrm-demo',
  TOMTOM_ORBIS: 'tomtom-orbis',
});

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function hasTomTomKey(env = process.env) {
  return String(env.TOMTOM_API_KEY || '').trim() !== '';
}

/**
 * Resolve active routing provider.
 * Prefer TomTom for `car` when keyed; foot/bike may stay on OSRM demo
 * (Orbis GA routing is car-first) unless EE_TOMTOM_ALL_PROFILES=1.
 *
 * @param {{ profile?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
export function resolveRouteProvider({ profile = 'car', env = process.env } = {}) {
  const keyed = hasTomTomKey(env);
  const allProfiles = env.EE_TOMTOM_ALL_PROFILES === '1';
  const wantTomTom =
    keyed && (profile === 'car' || allProfiles);

  if (wantTomTom) {
    return {
      id: ROUTE_PROVIDER_IDS.TOMTOM_ORBIS,
      label: 'TomTom Orbis Routing (free tier)',
      classification: 'LIVE',
      license: 'TomTom proprietary BYOK — free-tier caps enforced',
      needsKey: false,
      attribution: 'Routing © TomTom',
      demoFairUse: false,
    };
  }

  if (keyed && profile !== 'car' && !allProfiles) {
    return {
      id: ROUTE_PROVIDER_IDS.OSRM_DEMO,
      label: 'OSRM FOSSGIS (DEMO_FAIR_USE) — foot/bike; TomTom key reserved for car',
      classification: 'NEAR LIVE',
      license: 'FOSSGIS fair interactive use; ODbL',
      needsKey: false,
      attribution: 'Routing: OSRM on the FOSSGIS servers · © OpenStreetMap contributors',
      demoFairUse: true,
      note: 'TomTom Orbis free-tier key is configured but this profile uses OSRM demo.',
    };
  }

  return {
    id: ROUTE_PROVIDER_IDS.OSRM_DEMO,
    label: 'OSRM FOSSGIS (DEMO_FAIR_USE)',
    classification: keyed ? 'NEAR LIVE' : 'DEMO_FAIR_USE',
    license: 'FOSSGIS fair interactive use; ODbL — not a commercial SLA',
    needsKey: !keyed,
    needsKeyFor: keyed ? null : 'tomtom-orbis',
    attribution: 'Routing: OSRM on the FOSSGIS servers · © OpenStreetMap contributors',
    demoFairUse: true,
    note: keyed
      ? undefined
      : 'Set Fly secret TOMTOM_API_KEY for TomTom Orbis LIVE car routing (free-tier caps).',
  };
}

export function routeProviderStatus(env = process.env) {
  const keyed = hasTomTomKey(env);
  return {
    tomtomKeyConfigured: keyed,
    mapbox: 'not_wired',
    googleAppleGeometry: 'forbidden',
    waze: 'not_core',
    providers: {
      car: resolveRouteProvider({ profile: 'car', env }),
      foot: resolveRouteProvider({ profile: 'foot', env }),
      bike: resolveRouteProvider({ profile: 'bike', env }),
    },
    classification: keyed ? 'LIVE (car via TomTom when under budget)' : 'NEEDS_KEY for TomTom; OSRM DEMO_FAIR_USE active',
  };
}
