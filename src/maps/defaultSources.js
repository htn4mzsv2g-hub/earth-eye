import { MAP_STACKS } from './catalog.js';
import { photorealUnavailableReason } from './availability.js';
import { GOOGLE_PHOTOREAL_CREDIT_HTML } from './googlePhotorealQuota.js';
import { keySetupRequirement } from '../keySetupCore.mjs';
import {
  createOsmImagery,
  createEsriImagery,
  createIonImagery,
  ESRI_ATTRIBUTION_HTML,
} from './imagery.js';
import { createWorldTerrain, createKeylessTerrain } from './terrain.js';

/** Select sources and setup guidance without putting provider branches in the controller. */
export function createDefaultMapSources({
  googleTileset = null,
  cesiumToken = '',
  googleApiKey = '',
} = {}) {
  const ionToken = String(cesiumToken || '').trim();
  const hasIon = Boolean(ionToken);
  const hasGoogle = Boolean(String(googleApiKey || '').trim());
  const terrain = {
    id: hasIon ? 'world' : 'keyless',
    create: hasIon
      ? (request) => createWorldTerrain(ionToken, request)
      : createKeylessTerrain,
  };
  return {
    defaultId: googleTileset ? 'photoreal' : 'esri-imagery',
    unknownId: 'photoreal',
    recoveryId: googleTileset ? 'photoreal' : null,
    state: {
      hasCesiumIonToken: hasIon,
      hasGoogleMapsKey: hasGoogle,
      photorealConfigured: hasIon || hasGoogle,
      photorealActive: Boolean(googleTileset),
      globeStackPriority: ['google-direct', 'google-ion', 'esri-imagery', 'osm'],
    },
    sources: MAP_STACKS.map((descriptor) => {
      const common = {
        descriptor,
        available: !descriptor.requiresIon || hasIon,
        unavailableReason: descriptor.requiresIon
          ? keySetupRequirement('cesium-ion')
          : null,
      };
      if (descriptor.kind === 'photoreal')
        return {
          ...common,
          available: Boolean(googleTileset),
          unavailableReason: photorealUnavailableReason(hasIon || hasGoogle),
          tileset: googleTileset,
          credit: GOOGLE_PHOTOREAL_CREDIT_HTML,
        };
      const imagery =
        descriptor.kind === 'ion'
          ? () => createIonImagery(descriptor.style, ionToken)
          : descriptor.id === 'osm'
            ? createOsmImagery
            : createEsriImagery;
      return {
        ...common,
        imagery,
        terrain,
        ...(descriptor.id === 'esri-imagery'
          ? {
              credit: ESRI_ATTRIBUTION_HTML,
              constructionFallback: {
                id: 'osm',
                message: 'Esri Satellite is unavailable; using OSM',
              },
              // Threshold was 2 — flaky mobile Safari flipped to OSM street
              // tiles and looked broken vs aerial. Stay on Esri longer.
              tileFailureFallback: {
                id: 'osm',
                threshold: 16,
                message:
                  'Esri Satellite tiles failing; falling back to OSM roads (not aerial)',
              },
            }
          : {}),
      };
    }),
  };
}
