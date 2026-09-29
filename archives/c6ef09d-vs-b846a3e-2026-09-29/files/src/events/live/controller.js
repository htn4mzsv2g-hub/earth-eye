/**
 * EE-EVENTS-2/3 — Controller: fetch → filter → cohort → detail + RELATED.
 * Follow honesty: UNAVAILABLE until retention + notify (followAvailability.js).
 */

import { createWorldEventsClient } from './client.js';
import {
  applyEventFilters,
  emptyFilters,
  toggleFilterValue,
} from './filters.js';
import { selectMarkerCohort } from './cohort.js';
import { createWorldEventsPanel } from './panel.js';
import { createWorldEventsMarkers } from './markers.js';
import {
  selectWorldEvent,
  WORLD_EVENTS_LAYER_ID,
} from './selectionBridge.js';
import { buildEventDetail } from './detail.js';
import {
  buildRelatedConditions,
  mapActionAvailability,
  relatedAnchorFromEvent,
} from './related.js';
import {
  registerEntityContext,
  selectEntityContext,
  clearSelectedEntityContextForLayer,
} from '../../data/contextStore.js';
import {
  hitTestWorldOverlay,
  setOverlayEntries,
  clearOverlaySource,
  setOverlaySourceVisible,
} from '../../overlays/worldOverlay.js';

/**
 * @param {{
 *   viewer?: object|null,
 *   fetchImpl?: typeof fetch,
 *   signal?: AbortSignal,
 *   rendererDown?: boolean,
 *   getRelatedInputs?: () => Promise<{
 *     cameras?: object[],
 *     layerBags?: object,
 *     bounds?: object|null,
 *     viewCenter?: {lat:number,lon:number}|null,
 *     radiusKm?: number,
 *   }>|object,
 *   onFlyTo?: (event: object) => void,
 *   onShowOnGlobe?: (event: object) => void,
 * }} [opts]
 */
export function createWorldEventsController(opts = {}) {
  const client = createWorldEventsClient({
    fetchImpl: opts.fetchImpl,
  });

  const state = {
    phase: 'idle',
    health: null,
    error: null,
    events: [],
    filteredEvents: [],
    markerCohort: [],
    sources: [],
    eventCount: 0,
    filters: emptyFilters(),
    selectedEvent: null,
    relatedConditions: null,
    rendererDown: Boolean(opts.rendererDown),
    markersOn: true,
    generatedAt: null,
  };

  let markers = null;
  const listeners = new Set();

  function notify() {
    for (const fn of listeners) {
      try {
        fn(getState());
      } catch {
        /* panel listeners must not break controller */
      }
    }
  }

  function getState() {
    return {
      phase: state.phase,
      health: state.health,
      error: state.error,
      events: state.events,
      filteredEvents: state.filteredEvents,
      markerCohort: state.markerCohort,
      sources: state.sources,
      eventCount: state.eventCount,
      filters: {
        kinds: [...state.filters.kinds],
        tiers: [...state.filters.tiers],
        sources: [...state.filters.sources],
      },
      selectedEvent: state.selectedEvent,
      relatedConditions: state.relatedConditions,
      rendererDown: state.rendererDown,
      markersOn: state.markersOn,
      generatedAt: state.generatedAt,
      detail: state.selectedEvent
        ? buildEventDetail(state.selectedEvent)
        : null,
      mapActions: mapActionAvailability({
        rendererDown: state.rendererDown,
        hasAnchor: Boolean(
          state.selectedEvent && relatedAnchorFromEvent(state.selectedEvent),
        ),
      }),
    };
  }

  function recompute() {
    state.filteredEvents = applyEventFilters(state.events, state.filters);
    state.markerCohort = selectMarkerCohort(state.filteredEvents);
    if (markers && state.markersOn) {
      markers.setCohort(state.markerCohort);
    }
    notify();
  }

  function findEvent(eventId) {
    const id = String(eventId || '');
    return (
      state.events.find((e) => e.eventId === id) ||
      state.filteredEvents.find((e) => e.eventId === id) ||
      null
    );
  }

  async function refreshRelated(ev) {
    if (!ev) {
      state.relatedConditions = null;
      return null;
    }
    let inputs = {};
    try {
      const raw =
        typeof opts.getRelatedInputs === 'function'
          ? await opts.getRelatedInputs(ev)
          : opts.getRelatedInputs || {};
      inputs = raw && typeof raw === 'object' ? raw : {};
    } catch (err) {
      state.relatedConditions = buildRelatedConditions(ev, {
        cameras: [],
        layerBags: {},
        bounds: null,
      });
      // Annotate camera reason with fetch failure without inventing rows.
      if (state.relatedConditions?.cameras) {
        /* keep pure empty — panel shows "no related EE data" */
      }
      console.warn(
        '[WorldEvents] related inputs failed:',
        err?.message || err,
      );
      notify();
      return state.relatedConditions;
    }
    // Non-3D: never pass fake bounds. Only real viewport from host.
    const bounds =
      state.rendererDown || !inputs.bounds ? null : inputs.bounds;
    const viewCenter =
      state.rendererDown || !inputs.viewCenter ? null : inputs.viewCenter;
    state.relatedConditions = buildRelatedConditions(ev, {
      cameras: inputs.cameras || [],
      layerBags: inputs.layerBags || {},
      radiusKm: inputs.radiusKm,
      bounds,
      viewCenter,
    });
    notify();
    return state.relatedConditions;
  }

  function selectById(eventId) {
    const ev = findEvent(eventId);
    if (!ev) return null;
    state.selectedEvent = ev;
    state.relatedConditions = null;
    selectWorldEvent(ev, {
      registerEntityContext,
      selectEntityContext,
      entity: { __gevWorldEventId: ev.eventId },
    });
    markers?.publishSelection?.(ev);
    notify();
    void refreshRelated(ev);
    return ev;
  }

  function clearSelection() {
    state.selectedEvent = null;
    state.relatedConditions = null;
    clearSelectedEntityContextForLayer(WORLD_EVENTS_LAYER_ID);
    markers?.clearSelection?.();
    notify();
  }

  function setRendererDown(down) {
    state.rendererDown = Boolean(down);
    notify();
  }

  async function refresh({ force = true } = {}) {
    state.phase = 'loading';
    state.error = null;
    notify();
    const snap = await client.list({ force, limit: 200 });
    state.phase = snap.ok === false && !snap.events?.length ? 'error' : 'ready';
    state.health = snap.health || 'NO DATA';
    state.error = snap.error || snap.staleError || client.getLastError();
    state.events = [...(snap.events || [])];
    state.eventCount = state.events.length;
    state.sources = [...(snap.sources || [])];
    state.generatedAt = snap.generatedAt || null;
    // Drop selection if it vanished from the new snapshot.
    if (
      state.selectedEvent &&
      !state.events.some((e) => e.eventId === state.selectedEvent.eventId)
    ) {
      state.selectedEvent = null;
    }
    recompute();
    return getState();
  }

  function ensureMarkers(viewer) {
    if (!viewer || markers) return markers;
    // Graphics-recovery coexistence: if Cesium/WebGL viewer is dead or mid-teardown,
    // keep list/filters/disclosure; do not throw into console init / stuck startup.
    if (viewer.isDestroyed?.() || !viewer.scene || !viewer.dataSources) {
      return null;
    }
    try {
      const overlayHost = {
        setEntries: setOverlayEntries,
        clearSource: clearOverlaySource,
        setVisible: setOverlaySourceVisible,
        hitTest: hitTestWorldOverlay,
      };
      markers = createWorldEventsMarkers({
        viewer,
        overlayHost,
        getEventById: findEvent,
        onSelectEvent: (ev) => {
          state.selectedEvent = ev;
          state.relatedConditions = null;
          notify();
          void refreshRelated(ev);
        },
      });
      markers.setEnabled(state.markersOn);
      if (state.markersOn) markers.setCohort(state.markerCohort);
      return markers;
    } catch (err) {
      console.warn(
        '[WorldEvents] markers unavailable (graphics/viewer):',
        err?.message || err,
      );
      markers = null;
      return null;
    }
  }

  function setMarkersOn(on) {
    state.markersOn = Boolean(on);
    if (markers) {
      markers.setEnabled(state.markersOn);
      if (state.markersOn) markers.setCohort(state.markerCohort);
    }
    notify();
  }

  const panel = createWorldEventsPanel({
    getState,
    onToggleKind: (id) => {
      state.filters.kinds = toggleFilterValue(state.filters.kinds, id);
      recompute();
    },
    onToggleTier: (id) => {
      state.filters.tiers = toggleFilterValue(state.filters.tiers, id);
      recompute();
    },
    onToggleSource: (id) => {
      state.filters.sources = toggleFilterValue(state.filters.sources, id);
      recompute();
    },
    onSelect: (eventId) => selectById(eventId),
    onRefresh: () => {
      void refresh({ force: true });
    },
    onToggleMarkers: () => setMarkersOn(!state.markersOn),
    onClearSelection: () => clearSelection(),
    onFlyTo: () => {
      const ev = state.selectedEvent;
      if (!ev) return;
      if (typeof opts.onFlyTo === 'function') opts.onFlyTo(ev);
    },
    onShowOnGlobe: () => {
      const ev = state.selectedEvent;
      if (!ev) return;
      if (typeof opts.onShowOnGlobe === 'function') opts.onShowOnGlobe(ev);
    },
    get rendererDown() {
      return state.rendererDown;
    },
  });

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function destroy() {
    listeners.clear();
    markers?.destroy?.();
    markers = null;
    clearSelection();
  }

  if (opts.signal) {
    opts.signal.addEventListener(
      'abort',
      () => {
        destroy();
      },
      { once: true },
    );
  }

  if (opts.viewer) ensureMarkers(opts.viewer);

  return {
    getState,
    refresh,
    selectById,
    clearSelection,
    setMarkersOn,
    setRendererDown,
    refreshRelated,
    ensureMarkers,
    panel,
    subscribe,
    destroy,
    layerId: WORLD_EVENTS_LAYER_ID,
  };
}
