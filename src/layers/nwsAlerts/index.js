import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import {
  registerEntityContext,
  selectEntityContext,
  clearSelectedEntityContextForLayer,
} from '../../data/contextStore.js';
import { requestEventDetail } from '../../data/eventDetail.js';

const SEVERITY_COLOR = {
  Extreme: Cesium.Color.RED.withAlpha(0.45),
  Severe: Cesium.Color.ORANGE.withAlpha(0.4),
  Moderate: Cesium.Color.YELLOW.withAlpha(0.35),
  Minor: Cesium.Color.CYAN.withAlpha(0.3),
  Unknown: Cesium.Color.GRAY.withAlpha(0.3),
};

function colorFor(severity) {
  return SEVERITY_COLOR[severity] || SEVERITY_COLOR.Unknown;
}

function centroidOfGeometry(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  const type = geometry.type;
  let ring = null;
  if (type === 'Polygon') ring = geometry.coordinates[0];
  else if (type === 'MultiPolygon') ring = geometry.coordinates[0]?.[0];
  if (!Array.isArray(ring) || ring.length < 1) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const c of ring) {
    if (Array.isArray(c) && c.length >= 2) {
      sx += Number(c[0]);
      sy += Number(c[1]);
      n += 1;
    }
  }
  if (!n) return null;
  return { lon: sx / n, lat: sy / n };
}

/** NWS CAP weather alerts layer (api.weather.gov via /api/nws-alerts). */
export function createNwsAlertsLayer({ source } = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('NWS alerts require a snapshot source');

  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _clickHandler = null;
  let _unsub = null;
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;

  function publishSelection(entity) {
    if (!entity) return;
    const now = Cesium.JulianDate.now();
    const p = entity.properties;
    const alertId = p?.alertId?.getValue?.(now) ?? String(entity.id || '');
    const event = p?.event?.getValue?.(now);
    const severity = p?.severity?.getValue?.(now);
    const onset = p?.onset?.getValue?.(now);
    const ends = p?.ends?.getValue?.(now);
    const expires = p?.expires?.getValue?.(now);
    const sender = p?.senderName?.getValue?.(now);
    const areaDesc = p?.areaDesc?.getValue?.(now);
    const sourceUrl = p?.sourceUrl?.getValue?.(now);
    const hasGeom = p?.hasGeometry?.getValue?.(now);
    const cartesian = entity.position?.getValue?.(now);
    const carto = cartesian
      ? Cesium.Cartographic.fromCartesian(cartesian)
      : null;
    const lat = carto ? Cesium.Math.toDegrees(carto.latitude) : null;
    const lon = carto ? Cesium.Math.toDegrees(carto.longitude) : null;
    const endMs = Date.parse(ends || expires || '') || NaN;
    const ageMs = Number.isFinite(endMs) ? endMs - Date.now() : NaN;
    registerEntityContext(entity, {
      id: `weather-alerts:${alertId}`,
      layerId: 'weather-alerts',
      layerName: 'Weather Alerts (NWS)',
      source: 'NWS / api.weather.gov',
      label: event ? `${event} · ${severity || ''}` : `Alert ${alertId}`,
      latitude: lat,
      longitude: lon,
      properties: {
        eventType: 'weather-alert',
        alertId,
        event,
        severity,
        onset,
        ends,
        expires,
        senderName: sender,
        areaDesc,
        sourceUrl,
        temporalStatus: Number.isFinite(ageMs)
          ? ageMs < 0
            ? 'historical'
            : 'current'
          : 'unknown',
        note: hasGeom
          ? 'NWS CAP polygon from api.weather.gov (U.S. public domain).'
          : 'Zone-only product — no polygon geometry from NWS; areaDesc listed.',
      },
    });
    selectEntityContext(entity);
    requestEventDetail('weather-alerts', { eventId: alertId });
  }

  function rebuild(snap) {
    if (!_dataSource) return;
    _dataSource.entities.removeAll();
    _count = 0;
    _lastUpdate = snap?.fetchedAt || null;
    _lastError = snap?.error || null;
    const alerts = Array.isArray(snap?.alerts) ? snap.alerts : [];
    for (const alert of alerts) {
      if (!alert?.id) continue;
      const color = colorFor(alert.severity);
      const centroid = centroidOfGeometry(alert.geometry);
      const entity = _dataSource.entities.add({
        id: `nws:${alert.id}`,
        name: alert.event || alert.id,
        position: centroid
          ? Cesium.Cartesian3.fromDegrees(centroid.lon, centroid.lat)
          : undefined,
        point: centroid
          ? {
              pixelSize: 10,
              color: color.withAlpha(1),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            }
          : undefined,
        label: {
          text: alert.event || 'Alert',
          font: '11px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          show: Boolean(centroid),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        properties: {
          alertId: alert.id,
          event: alert.event,
          severity: alert.severity,
          urgency: alert.urgency,
          certainty: alert.certainty,
          onset: alert.onset,
          ends: alert.ends,
          expires: alert.expires,
          senderName: alert.senderName,
          areaDesc: alert.areaDesc,
          sourceUrl: alert.sourceUrl,
          hasGeometry: Boolean(alert.geometry),
          headline: alert.headline,
        },
      });
      // Attach polygon hierarchy from GeoJSON coordinates when present.
      if (
        alert.geometry?.type === 'Polygon' &&
        alert.geometry.coordinates?.[0]
      ) {
        const ring = alert.geometry.coordinates[0]
          .map((c) => Cesium.Cartesian3.fromDegrees(c[0], c[1]))
          .filter(Boolean);
        if (ring.length >= 3) {
          entity.polygon = new Cesium.PolygonGraphics({
            hierarchy: new Cesium.PolygonHierarchy(ring),
            material: color,
            outline: true,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          });
        }
      } else if (
        alert.geometry?.type === 'MultiPolygon' &&
        alert.geometry.coordinates?.[0]?.[0]
      ) {
        const ring = alert.geometry.coordinates[0][0]
          .map((c) => Cesium.Cartesian3.fromDegrees(c[0], c[1]))
          .filter(Boolean);
        if (ring.length >= 3) {
          entity.polygon = new Cesium.PolygonGraphics({
            hierarchy: new Cesium.PolygonHierarchy(ring),
            material: color,
            outline: true,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          });
        }
      }
      _count += 1;
    }
  }

  function installSelection() {
    if (_clickHandler || !_viewer?.scene?.canvas) return;
    _clickHandler = new Cesium.ScreenSpaceEventHandler(_viewer.scene.canvas);
    _clickHandler.setInputAction((click) => {
      if (!_enabled || !isPointerFree() || !click?.position) return;
      const picked = _viewer.scene.pick(click.position);
      const entity = picked?.id;
      if (!entity || !_dataSource?.entities.contains(entity)) return;
      publishSelection(entity);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  return {
    id: 'weather-alerts',
    name: 'Weather Alerts (NWS)',
    icon: '⚠',
    source: 'NWS · api.weather.gov',
    // Manager-owned refresh cadence; source also self-polls while started.
    updateInterval: 90_000,
    init(viewer) {
      if (_viewer)
        throw new Error('Weather alerts layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('weather-alerts');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      installSelection();
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
      _enabled = false;
    },
    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      if (!_unsub) {
        _unsub = source.subscribe?.(rebuild) || null;
        rebuild(source.getSnapshot());
      }
    },
    disable() {
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
      clearSelectedEntityContextForLayer('weather-alerts');
    },
    async update() {
      if (!_enabled || !_dataSource) return false;
      try {
        if (typeof source.refresh === 'function') await source.refresh();
        else rebuild(source.getSnapshot());
        if (!_enabled) return false;
        // rebuild may have been driven by subscribe(refresh); re-read for honesty.
        const snap = source.getSnapshot();
        if (!_unsub) rebuild(snap);
        _lastError = snap?.error || null;
        return !_lastError;
      } catch (err) {
        _lastError = String(err?.message || err);
        return false;
      }
    },
    /** Limit NWS CAP fetch to a US state when the camera is over CONUS. */
    setAlertArea(area) {
      source.setArea?.(area);
    },
    getParams() {
      return {
        enabled: _enabled,
        count: _count,
        lastUpdate: _lastUpdate,
        lastError: _lastError,
      };
    },
    getRowControls() {
      return {
        summary: `${_count} alert${_count === 1 ? '' : 's'}`,
        productKind: 'observed',
        productKindLabel: 'Official NWS CAP alerts (observed / issued)',
        note: 'U.S. public domain · api.weather.gov · no AI warnings',
      };
    },
    getStats() {
      return {
        count: _count,
        lastUpdate: _lastUpdate ? Date.parse(_lastUpdate) || _lastUpdate : null,
        error: _lastError,
      };
    },
    destroy(viewer = _viewer) {
      _enabled = false;
      if (_unsub) {
        _unsub();
        _unsub = null;
      }
      source.stop?.();
      if (_clickHandler) {
        _clickHandler.destroy();
        _clickHandler = null;
      }
      if (_dataSource && viewer) {
        viewer.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      clearSelectedEntityContextForLayer('weather-alerts');
      _viewer = null;
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
    },
  };
}
