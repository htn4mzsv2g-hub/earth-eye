import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldEvent } from '../worldEventContract.js';
import { buildEventDetail, RELATED_NOTE } from './detail.js';
import {
  relatedCamerasForEvent,
  relatedLayersForEvent,
  buildRelatedConditions,
  mapActionAvailability,
  relatedAnchorFromEvent,
} from './related.js';
import { worldEventIdentity, WORLD_EVENTS_LAYER_ID } from './selectionBridge.js';
import { createWorldEventsPanel } from './panel.js';

function officialPoint(id = 'usgs:t1') {
  return createWorldEvent({
    eventId: id,
    kind: 'PUBLIC DATA OBSERVATION',
    sources: ['USGS Earthquake Hazards Program'],
    title: 'M3.2 — test',
    precision: 'point',
    geometry: { type: 'Point', lon: -97.74, lat: 30.27 },
    eventTime: { start: '2026-09-29T10:00:00.000Z' },
    retrievedAt: '2026-09-29T11:00:00.000Z',
    firstReported: '2026-09-29T10:05:00.000Z',
    attribution: {
      credit: 'U.S. Geological Survey',
      sourceLinks: ['https://earthquake.usgs.gov/'],
    },
    revisionState: 'active',
    severity: { label: 'light', value: 3.2, scale: 'Richter' },
  });
}

function newsRegion() {
  return createWorldEvent({
    eventId: 'gdelt:host:abc',
    kind: 'NEWS REPORT',
    sources: ['GDELT Project DOC 2.0'],
    title: 'City flooded say reports',
    precision: 'region',
    geometry: { type: 'Region', name: 'Austin' },
    eventTime: { start: '2026-09-29T09:00:00.000Z' },
    retrievedAt: '2026-09-29T11:00:00.000Z',
    attribution: { credit: 'GDELT Project' },
    revisionState: 'active',
  });
}

test('EE-EVENTS-3 detail: name/id/kind/sources/times/severity/status', () => {
  const d = buildEventDetail(officialPoint());
  assert.equal(d.eventId, 'usgs:t1');
  assert.equal(d.name, 'M3.2 — test');
  assert.equal(d.kind, 'PUBLIC DATA OBSERVATION');
  assert.ok(d.sources.includes('USGS Earthquake Hazards Program'));
  assert.equal(d.attribution.credit, 'U.S. Geological Survey');
  assert.ok(d.attribution.sourceLinks[0].includes('usgs.gov'));
  assert.ok(d.times.eventStart);
  assert.ok(d.times.retrieved);
  assert.ok(d.times.published);
  assert.equal(d.severity.sourceProvided, true);
  assert.equal(d.severity.value, 3.2);
  assert.equal(d.status, 'active');
  assert.equal(d.geometry.precision, 'point');
  assert.equal(d.geometry.hasPlottableAnchor, true);
  assert.match(d.relatedBanner, /not causal/i);
});

test('EE-EVENTS-3 detail: severity null when source omitted', () => {
  const d = buildEventDetail(newsRegion());
  assert.equal(d.severity, null);
  assert.equal(d.newsIsNotOfficial, true);
  assert.equal(d.geometry.imprecise, true);
  assert.equal(d.geometry.hasPlottableAnchor, false);
  assert.match(d.geometry.note, /imprecise/i);
});

test('EE-EVENTS-3 shared Analyst identity stays world-events', () => {
  const id = worldEventIdentity(officialPoint());
  assert.equal(id.type, WORLD_EVENTS_LAYER_ID);
  assert.equal(id.layerId, WORLD_EVENTS_LAYER_ID);
  assert.equal(id.providerId, 'usgs:t1');
  assert.ok(Number.isFinite(id.lat) && Number.isFinite(id.lon));
});

test('EE-EVENTS-3 related cameras: place/radius, never fake IN VIEW without bounds', () => {
  const ev = officialPoint();
  const cams = [
    { id: 'c1', name: 'Near', lat: 30.28, lon: -97.74, provider: 'test' },
    { id: 'c2', name: 'Far', lat: 40.0, lon: -74.0, provider: 'test' },
  ];
  const noView = relatedCamerasForEvent(ev, cams, { radiusKm: 80, bounds: null });
  assert.equal(noView.labeledInView, false);
  assert.ok(noView.items.some((c) => c.id === 'c1'));
  assert.ok(!noView.items.some((c) => c.id === 'c2'));
  assert.ok(noView.items.every((c) => c.inView === false));
  assert.ok(noView.items.every((c) => c.relation === 'RELATED' && c.causal === false));

  const withBounds = relatedCamerasForEvent(ev, cams, {
    radiusKm: 80,
    bounds: { west: -98, south: 30, east: -97, north: 31 },
  });
  assert.equal(withBounds.labeledInView, true);
  const near = withBounds.items.find((c) => c.id === 'c1');
  assert.equal(near.inView, true);
});

test('EE-EVENTS-3 related cameras: region event has no invented anchor', () => {
  const block = relatedCamerasForEvent(newsRegion(), [
    { id: 'c1', name: 'X', lat: 30.27, lon: -97.74 },
  ]);
  assert.equal(block.available, false);
  assert.equal(block.items.length, 0);
  assert.match(block.reason, /plottable place/i);
});

test('EE-EVENTS-3 related layers only when real EE rows supplied', () => {
  const ev = officialPoint();
  const empty = relatedLayersForEvent(ev, {});
  assert.equal(empty.fires.available, false);
  assert.match(empty.fires.reason, /No related EE data/i);

  const filled = relatedLayersForEvent(ev, {
    fires: [
      { id: 'f1', label: 'Hotspot', lat: 30.3, lon: -97.7, frp: 12 },
      { id: 'f2', label: 'Distant', lat: 0, lon: 0 },
    ],
    aircraft: [{ id: 'a1', callsign: 'TEST1', lat: 30.27, lon: -97.74 }],
  });
  assert.equal(filled.fires.available, true);
  assert.equal(filled.fires.items[0].relation, 'RELATED');
  assert.equal(filled.fires.items[0].causal, false);
  assert.ok(filled.fires.items.every((x) => x.id !== 'f2'));
  assert.equal(filled.aircraft.available, true);
  assert.equal(filled.weather.available, false);
});

test('EE-EVENTS-3 RELATED banner never says caused by', () => {
  const block = buildRelatedConditions(officialPoint(), {
    cameras: [{ id: 'c1', name: 'Cam', lat: 30.27, lon: -97.74 }],
    layerBags: {},
    bounds: null,
  });
  assert.equal(block.relation, 'RELATED');
  assert.equal(block.causalClaim, false);
  assert.match(block.note, /RELATED/);
  assert.doesNotMatch(block.note, /caused by/i);
  assert.match(RELATED_NOTE, /not causal/i);
});

test('EE-EVENTS-3 map actions UNAVAILABLE when renderer down', () => {
  const down = mapActionAvailability({ rendererDown: true, hasAnchor: true });
  assert.equal(down.flyTo.status, 'UNAVAILABLE');
  assert.equal(down.showOnGlobe.status, 'UNAVAILABLE');
  assert.match(down.flyTo.reason, /3D|renderer|globe/i);
  assert.equal(down.flyTo.available, false);

  const noAnchor = mapActionAvailability({
    rendererDown: false,
    hasAnchor: false,
  });
  assert.equal(noAnchor.flyTo.status, 'UNAVAILABLE');

  const ok = mapActionAvailability({ rendererDown: false, hasAnchor: true });
  assert.equal(ok.flyTo.status, 'AVAILABLE');
  assert.equal(ok.showOnGlobe.available, true);
});

test('EE-EVENTS-3 panel HTML: detail + RELATED + UNAVAILABLE map actions', () => {
  const ev = officialPoint();
  const related = buildRelatedConditions(ev, {
    cameras: [{ id: 'c1', name: 'Near Cam', lat: 30.28, lon: -97.74 }],
    layerBags: {
      fires: [{ id: 'f1', label: 'Fire A', lat: 30.29, lon: -97.73 }],
    },
    bounds: null,
  });
  let html = '';
  const body = {
    innerHTML: '',
    isConnected: true,
    querySelector: () => ({}),
    set innerHTML(v) {
      html = v;
    },
    get innerHTML() {
      return html;
    },
  };
  // Minimal DOM stub via Object
  const target = {
    _html: '',
    isConnected: true,
    querySelector(sel) {
      return sel ? {} : null;
    },
    set innerHTML(v) {
      this._html = String(v);
    },
    get innerHTML() {
      return this._html;
    },
  };
  const panel = createWorldEventsPanel({
    getState: () => ({
      phase: 'ready',
      health: 'OK',
      eventCount: 1,
      filteredEvents: [ev],
      markerCohort: [],
      sources: [],
      filters: { kinds: [], tiers: [], sources: [] },
      selectedEvent: ev,
      relatedConditions: related,
      rendererDown: true,
      markersOn: false,
      error: null,
    }),
    onToggleKind() {},
    onToggleTier() {},
    onToggleSource() {},
    onSelect() {},
    onRefresh() {},
    onToggleMarkers() {},
    onClearSelection() {},
    rendererDown: true,
  });
  panel.render(target, { textContent: '' });
  assert.match(target.innerHTML, /data-ee-we-detail/);
  assert.match(target.innerHTML, /RELATED/);
  assert.match(target.innerHTML, /Near Cam/);
  assert.match(target.innerHTML, /Fire A/);
  assert.match(target.innerHTML, /UNAVAILABLE/);
  assert.match(target.innerHTML, /not causal|Never labeled CAUSED BY/i);
  assert.doesNotMatch(target.innerHTML, /CAUSED BY this event/i);
  assert.match(target.innerHTML, /null \(not provided by source\)|source-provided/);
  assert.match(target.innerHTML, /usgs:t1/);
});

test('relatedAnchorFromEvent rejects region', () => {
  assert.equal(relatedAnchorFromEvent(newsRegion()), null);
  const a = relatedAnchorFromEvent(officialPoint());
  assert.ok(a && a.lat === 30.27);
});
