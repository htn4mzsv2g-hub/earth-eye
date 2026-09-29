/**
 * EE-EVENTS-2 — Bounded globe markers via Cesium data source + world overlay.
 * Does not rewrite Cesium; reuses CustomDataSource + overlayHost cohort.
 * Region/unknown events are never plotted (see cohort.js).
 */

import * as Cesium from 'cesium';
import {
  WORLD_EVENTS_OVERLAY_SOURCE_ID,
  WORLD_EVENTS_MARKER_COHORT_LIMIT,
  WORLD_EVENTS_OVERLAY_COLLISION_CAPACITY,
  createWorldEventOverlaySpec,
} from './cohort.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import {
  registerEntityContext,
  selectEntityContext,
  clearSelectedEntityContextForLayer,
} from '../../data/contextStore.js';
import { selectWorldEvent, WORLD_EVENTS_LAYER_ID } from './selectionBridge.js';

const ENTITY_PREFIX = 'world-event:';

/**
 * @param {{
 *   viewer: object,
 *   overlayHost?: { setEntries?: Function, clearSource?: Function, setVisible?: Function, hitTest?: Function },
 *   onSelectEvent?: (event: object) => void,
 *   getEventById?: (id: string) => object|null,
 * }} opts
 */
export function createWorldEventsMarkers({
  viewer,
  overlayHost = null,
  onSelectEvent = null,
  getEventById = () => null,
} = {}) {
  if (!viewer) throw new TypeError('World Events markers require a viewer');

  let dataSource = null;
  let clickHandler = null;
  let enabled = false;
  let selectedId = null;
  /** @type {Map<string, object>} */
  const byEntityId = new Map();

  function ensureDataSource() {
    if (dataSource) return dataSource;
    if (viewer?.isDestroyed?.() || !viewer?.dataSources) {
      throw new Error('viewer unavailable for World Events markers');
    }
    dataSource = new Cesium.CustomDataSource(WORLD_EVENTS_LAYER_ID);
    dataSource.show = false;
    viewer.dataSources.add(dataSource);
    return dataSource;
  }

  function kindColor(kind) {
    if (kind === 'OFFICIAL ALERT' || kind === 'OFFICIAL REPORT')
      return Cesium.Color.fromCssColorString('#f59e0b');
    if (kind === 'NEWS REPORT')
      return Cesium.Color.fromCssColorString('#94a3b8');
    if (kind === 'HUMANITARIAN REPORT')
      return Cesium.Color.fromCssColorString('#38bdf8');
    return Cesium.Color.fromCssColorString('#34d399');
  }

  /**
   * Publish a bounded cohort onto the globe.
   * @param {Array<{event:object, lon:number, lat:number, anchor:string, priority:number, title:string, kindLabel:string}>} cohort
   */
  function setCohort(cohort) {
    if (viewer?.isDestroyed?.()) return;
    let ds;
    try {
      ds = ensureDataSource();
    } catch (err) {
      console.warn('[WorldEvents] setCohort skipped:', err?.message || err);
      return;
    }
    ds.entities.removeAll();
    byEntityId.clear();
    const overlayEntries = [];
    const rows = Array.isArray(cohort) ? cohort : [];

    for (const row of rows) {
      const event = row.event;
      if (!event?.eventId) continue;
      const eid = `${ENTITY_PREFIX}${event.eventId}`;
      const position = Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
      const color = kindColor(event.kind);
      const entity = ds.entities.add(
        new Cesium.Entity({
          id: eid,
          position,
          point: {
            pixelSize: event.kind === 'OFFICIAL ALERT' ? 12 : 9,
            color: color.withAlpha(0.92),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.65),
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: {
            eventId: event.eventId,
            kind: event.kind,
            title: row.title,
            precision: event.precision,
            anchor: row.anchor,
          },
        }),
      );
      byEntityId.set(eid, event);
      const spec = createWorldEventOverlaySpec(row);
      overlayEntries.push({ ...spec, position });
    }

    if (overlayHost?.setEntries) {
      overlayHost.setEntries(
        WORLD_EVENTS_OVERLAY_SOURCE_ID,
        overlayEntries.slice(0, WORLD_EVENTS_MARKER_COHORT_LIMIT),
        {
          cohortLimit: WORLD_EVENTS_MARKER_COHORT_LIMIT,
          collisionCapacity: WORLD_EVENTS_OVERLAY_COLLISION_CAPACITY,
          moving: false,
        },
      );
    }
  }

  function publishSelection(event) {
    if (!event) return;
    const carrier = { __gevWorldEventId: event.eventId };
    selectWorldEvent(event, {
      registerEntityContext,
      selectEntityContext,
      entity: carrier,
    });
    selectedId = event.eventId;
    onSelectEvent?.(event);
  }

  function clearSelection() {
    selectedId = null;
    clearSelectedEntityContextForLayer(WORLD_EVENTS_LAYER_ID);
  }

  function installClick() {
    if (clickHandler || !viewer?.scene?.canvas) return;
    clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction((click) => {
      if (!enabled || !isPointerFree() || !click?.position) return;

      // Overlay hit first (labels).
      const cardHit = overlayHost?.hitTest?.(
        click.position.x,
        click.position.y,
        { sourceId: WORLD_EVENTS_OVERLAY_SOURCE_ID },
      );
      if (cardHit?.entryId) {
        const ev =
          getEventById(cardHit.entryId) ||
          byEntityId.get(`${ENTITY_PREFIX}${cardHit.entryId}`);
        if (ev) {
          publishSelection(ev);
          return;
        }
      }

      const picked = viewer.scene.pick(click.position);
      const entity = picked?.id;
      const eid = typeof entity?.id === 'string' ? entity.id : null;
      if (eid && eid.startsWith(ENTITY_PREFIX) && byEntityId.has(eid)) {
        publishSelection(byEntityId.get(eid));
        return;
      }
      // Empty globe click: only clear our selection if we owned it.
      if (selectedId) clearSelection();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClick() {
    if (clickHandler && !clickHandler.isDestroyed?.()) clickHandler.destroy();
    clickHandler = null;
  }

  function setEnabled(on) {
    enabled = Boolean(on);
    const ds = ensureDataSource();
    ds.show = enabled;
    overlayHost?.setVisible?.(WORLD_EVENTS_OVERLAY_SOURCE_ID, enabled);
    if (enabled) installClick();
    else {
      removeClick();
      clearSelection();
      overlayHost?.clearSource?.(WORLD_EVENTS_OVERLAY_SOURCE_ID);
      ds.entities.removeAll();
      byEntityId.clear();
    }
  }

  function destroy() {
    setEnabled(false);
    removeClick();
    clearSelection();
    if (dataSource) {
      try {
        viewer.dataSources.remove(dataSource, true);
      } catch {
        /* viewer teardown */
      }
      dataSource = null;
    }
    byEntityId.clear();
  }

  return {
    setCohort,
    setEnabled,
    isEnabled: () => enabled,
    publishSelection,
    clearSelection,
    destroy,
    sourceId: WORLD_EVENTS_OVERLAY_SOURCE_ID,
  };
}
