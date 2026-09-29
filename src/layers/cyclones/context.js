/**
 * Publish cyclone advisories into the shared entity context so a marker tap
 * opens the same detail path Analyst / tracked readout / mobile sheets use.
 */
import {
  getContextStore,
  registerEntityContext,
  selectEntityContext,
} from '../../data/contextStore.js';

const CLASSIFICATION_NAMES = Object.freeze({
  PTC: 'Potential tropical cyclone',
  HU: 'Hurricane',
  TS: 'Tropical storm',
  TD: 'Tropical depression',
  SS: 'Subtropical storm',
  SD: 'Subtropical depression',
});

export function classificationName(code) {
  return Object.hasOwn(CLASSIFICATION_NAMES, code)
    ? CLASSIFICATION_NAMES[code]
    : code || 'Unknown';
}

/**
 * current = live advisory with coherent geometry
 * pending = advisory current but track/cone not yet attached
 * stale = snapshot marked stale
 * unknown = missing times / unavailable
 */
export function cycloneTemporalStatus(storm, snapshot) {
  if (!storm) return 'unknown';
  if (snapshot?.stale) return 'stale';
  if (snapshot?.unavailable) return 'unknown';
  if (storm.geometryStatus === 'pending') return 'pending';
  if (storm.geometryStatus === 'current' || storm.issuedAt) return 'current';
  return 'unknown';
}

export function cycloneContextId(stormId) {
  return `weather-cyclones:${stormId}`;
}

export function buildCycloneContextProperties(storm, snapshot) {
  const status = cycloneTemporalStatus(storm, snapshot);
  return {
    eventType: 'cyclone',
    name: storm.name,
    classification: storm.classification,
    classificationName: classificationName(storm.classification),
    basin: storm.basin,
    advisoryNumber: storm.advisoryNumber,
    issuedAt: storm.issuedAt,
    positionAt: storm.positionAt,
    windKt: storm.windKt,
    pressureHpa: storm.pressureHpa,
    movement: storm.movement || null,
    advisoryUrl: storm.advisoryUrl || null,
    geometryStatus: storm.geometryStatus || null,
    temporalStatus: status,
    source: 'NOAA NHC / CPHC',
    coverage:
      snapshot?.coverage ||
      'Atlantic and eastern/central North Pacific; not worldwide cyclone coverage.',
    legend: [
      {
        label: 'Advisory center / forecast track',
        color: '#7fe6ed',
        meaning: 'Observed/forecast center positions from the advisory',
      },
      {
        label: 'Center-track uncertainty cone',
        color: '#7fe6ed44',
        meaning:
          'Forecast center-track uncertainty — not storm size or full hazard area',
      },
    ],
    note:
      status === 'pending'
        ? 'Track/cone geometry pending for this advisory number; marker is the advisory center only.'
        : 'Cone describes forecast center-track uncertainty, not storm size.',
  };
}

/** Register + select a storm; returns the context record or null. */
export function publishCycloneSelection(storm, snapshot) {
  if (!storm?.id) return null;
  try {
    const entity = storm.contextEntity || (storm.contextEntity = { show: true });
    const props = buildCycloneContextProperties(storm, snapshot);
    const id = cycloneContextId(storm.id);
    registerEntityContext(entity, {
      id,
      layerId: 'weather-cyclones',
      layerName: 'Cyclone advisories',
      source: props.source,
      label: `${storm.name} · ${props.classificationName}`,
      latitude: storm.position?.latitude ?? null,
      longitude: storm.position?.longitude ?? null,
      properties: props,
    });
    return selectEntityContext(entity);
  } catch {
    return null;
  }
}

export function clearCycloneContext(stormId = null) {
  try {
    const store = getContextStore();
    if (stormId) {
      const id = cycloneContextId(stormId);
      store.entities.delete(id);
      if (store.selectedEntityId === id) {
        store.selectedEntityId = null;
        store.selectedAt = null;
        try {
          if (typeof window.CustomEvent === 'function') {
            window.dispatchEvent(
              new CustomEvent('gev:entity-selection-cleared', {
                detail: { layerId: 'weather-cyclones' },
              }),
            );
          }
        } catch {
          /* non-DOM */
        }
      }
      return;
    }
    for (const key of [...store.entities.keys()]) {
      if (String(key).startsWith('weather-cyclones:')) store.entities.delete(key);
    }
    if (String(store.selectedEntityId || '').startsWith('weather-cyclones:')) {
      store.selectedEntityId = null;
      store.selectedAt = null;
      window.dispatchEvent(
        new CustomEvent('gev:entity-selection-cleared', {
          detail: { layerId: 'weather-cyclones' },
        }),
      );
    }
  } catch {
    // no DOM / store
  }
}
