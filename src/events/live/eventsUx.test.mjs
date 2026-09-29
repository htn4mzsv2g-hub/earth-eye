import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldEvent } from '../worldEventContract.js';
import {
  applyEventFilters,
  emptyFilters,
  kindShortLabel,
  sourceIdFromEvent,
  FILTER_KIND_CHIPS,
} from './filters.js';
import {
  markerAnchorFromEvent,
  selectMarkerCohort,
  countListOnly,
  WORLD_EVENTS_MARKER_COHORT_LIMIT,
} from './cohort.js';
import { compactDisclosure, disclosureHintText } from './disclosure.js';
import {
  worldEventIdentity,
  worldEventToContextRecord,
  WORLD_EVENTS_LAYER_ID,
} from './selectionBridge.js';
import { uiStatusFromFetch, sourceHealthLines } from './statusCopy.js';
import { createWorldEventsClient } from './client.js';

function officialPoint(id = 'usgs:t1') {
  return createWorldEvent({
    eventId: id,
    kind: 'PUBLIC DATA OBSERVATION',
    sources: ['USGS Earthquake Hazards Program'],
    title: 'M3.2 — test',
    precision: 'point',
    geometry: { type: 'Point', lon: -98.1, lat: 30.4 },
    eventTime: { start: '2026-09-29T10:00:00.000Z' },
    retrievedAt: '2026-09-29T11:00:00.000Z',
    attribution: { credit: 'U.S. Geological Survey' },
    revisionState: 'active',
  });
}

function newsRegion() {
  return createWorldEvent({
    eventId: 'gdelt:host:abc',
    kind: 'NEWS REPORT',
    sources: ['GDELT Project DOC 2.0', 'example.com'],
    title: 'City flooded say reports',
    precision: 'region',
    geometry: { type: 'Region', name: 'Austin' },
    eventTime: { start: '2026-09-29T09:00:00.000Z' },
    retrievedAt: '2026-09-29T11:00:00.000Z',
    attribution: { credit: 'GDELT Project' },
    revisionState: 'active',
  });
}

function nwsOfficial() {
  return createWorldEvent({
    eventId: 'nws:urn:oid:test:1',
    kind: 'OFFICIAL ALERT',
    sources: ['NWS / api.weather.gov'],
    title: 'Flood Watch',
    precision: 'region',
    geometry: { type: 'Region', name: 'Travis' },
    eventTime: { start: '2026-09-29T12:00:00.000Z' },
    retrievedAt: '2026-09-29T12:05:00.000Z',
    attribution: { credit: 'NWS' },
    revisionState: 'active',
  });
}

test('FILTER_KIND_CHIPS keep NEWS distinct from OFFICIAL', () => {
  const news = FILTER_KIND_CHIPS.find((c) => c.id === 'NEWS REPORT');
  const off = FILTER_KIND_CHIPS.find((c) => c.id === 'OFFICIAL ALERT');
  assert.ok(news);
  assert.ok(off);
  assert.equal(news.matches.includes('OFFICIAL ALERT'), false);
  assert.equal(off.matches.includes('NEWS REPORT'), false);
  assert.equal(kindShortLabel('NEWS REPORT'), 'NEWS');
  assert.equal(kindShortLabel('OFFICIAL ALERT'), 'OFFICIAL');
});

test('applyEventFilters: kind chip NEWS only returns NEWS REPORT', () => {
  const events = [officialPoint(), newsRegion(), nwsOfficial()];
  const filtered = applyEventFilters(events, {
    ...emptyFilters(),
    kinds: ['NEWS REPORT'],
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].kind, 'NEWS REPORT');
});

test('applyEventFilters: OFFICIAL chip includes OFFICIAL ALERT', () => {
  const events = [officialPoint(), newsRegion(), nwsOfficial()];
  const filtered = applyEventFilters(events, {
    kinds: ['OFFICIAL ALERT'],
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].kind, 'OFFICIAL ALERT');
});

test('applyEventFilters: source usgs prefix', () => {
  const events = [officialPoint('usgs:abc'), newsRegion()];
  const filtered = applyEventFilters(events, { sources: ['usgs-earthquakes'] });
  assert.equal(filtered.length, 1);
  assert.equal(sourceIdFromEvent(filtered[0]), 'usgs-earthquakes');
});

test('markerAnchorFromEvent: point ok; region never invents coords', () => {
  const pt = markerAnchorFromEvent(officialPoint());
  assert.equal(pt.lon, -98.1);
  assert.equal(pt.lat, 30.4);
  assert.equal(markerAnchorFromEvent(newsRegion()), null);
  assert.equal(markerAnchorFromEvent(nwsOfficial()), null);
});

test('selectMarkerCohort: bounds + skips imprecise', () => {
  const many = [];
  for (let i = 0; i < 100; i++) {
    many.push(
      createWorldEvent({
        eventId: `usgs:q${i}`,
        kind: 'PUBLIC DATA OBSERVATION',
        sources: ['USGS'],
        title: `Q${i}`,
        precision: 'point',
        geometry: { type: 'Point', lon: -100 + i * 0.01, lat: 30 },
        eventTime: { start: '2026-09-29T10:00:00.000Z' },
        retrievedAt: '2026-09-29T11:00:00.000Z',
        attribution: { credit: 'USGS' },
        revisionState: 'active',
      }),
    );
  }
  many.push(newsRegion());
  const cohort = selectMarkerCohort(many);
  assert.ok(cohort.length <= WORLD_EVENTS_MARKER_COHORT_LIMIT);
  assert.equal(
    cohort.every((r) => r.event.precision === 'point'),
    true,
  );
  assert.equal(countListOnly(many), 1);
});

test('compactDisclosure: source + times + NEWS disclaimer', () => {
  const d = compactDisclosure(newsRegion());
  assert.equal(d.newsIsNotOfficial, true);
  assert.equal(d.kind, 'NEWS REPORT');
  assert.match(d.attribution, /GDELT/i);
  assert.ok(d.eventTimeStart);
  assert.ok(d.retrievedAt);
  assert.equal(d.precision, 'region');
  assert.match(disclosureHintText(d), /NEWS ≠ OFFICIAL/);
  const lines = d.lines.map((l) => l.key);
  assert.ok(lines.includes('source'));
  assert.ok(lines.includes('eventTime'));
  assert.ok(lines.includes('retrieved'));
  assert.ok(lines.includes('precision'));
});

test('worldEventIdentity shares LIVE-5 Earth Eye contract', () => {
  const id = worldEventIdentity(officialPoint('usgs:us7000'));
  assert.ok(id);
  assert.equal(id.id, 'usgs:us7000');
  assert.equal(id.type, WORLD_EVENTS_LAYER_ID);
  assert.match(id.source, /Geological|USGS/i);
  assert.equal(id.lat, 30.4);
  assert.equal(id.lon, -98.1);
  const rec = worldEventToContextRecord(officialPoint('usgs:us7000'));
  assert.equal(rec.properties.detailPanel, 'full');
  assert.equal(rec.layerId, WORLD_EVENTS_LAYER_ID);
});

test('uiStatusFromFetch: never endless SYNCING; empty/degraded honest', () => {
  assert.equal(uiStatusFromFetch({ phase: 'loading' }).code, 'LOADING');
  assert.notEqual(uiStatusFromFetch({ phase: 'loading' }).code, 'SYNCING');
  assert.equal(
    uiStatusFromFetch({
      phase: 'ready',
      health: 'READY',
      eventCount: 0,
      filteredCount: 0,
    }).code,
    'EMPTY',
  );
  assert.equal(
    uiStatusFromFetch({
      phase: 'ready',
      health: 'READY',
      eventCount: 5,
      filteredCount: 0,
    }).code,
    'EMPTY_FILTER',
  );
  assert.equal(
    uiStatusFromFetch({
      phase: 'ready',
      health: 'DEGRADED',
      eventCount: 3,
      filteredCount: 3,
    }).code,
    'DEGRADED',
  );
  assert.equal(
    uiStatusFromFetch({ phase: 'ready', health: 'NEEDS KEY' }).code,
    'NEEDS KEY',
  );
  assert.equal(
    uiStatusFromFetch({ phase: 'ready', health: 'PERMISSION HELD' }).code,
    'PERMISSION HELD',
  );
  const lines = sourceHealthLines([
    { id: 'reliefweb', health: 'PERMISSION HELD', count: 0, reason: 'held' },
    { id: 'usgs-earthquakes', health: 'READY', count: 2 },
  ]);
  assert.equal(lines[0].attention, true);
  assert.equal(lines[1].attention, false);
});

test('createWorldEventsClient: LOADING then READY; error not fake LIVE', async () => {
  let calls = 0;
  const client = createWorldEventsClient({
    fetchImpl: async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            health: 'READY',
            events: [officialPoint()],
            sources: [{ id: 'usgs-earthquakes', health: 'READY', count: 1 }],
            generatedAt: '2026-09-29T12:00:00.000Z',
          });
        },
      };
    },
  });
  assert.equal(client.getPhase(), 'idle');
  const p = client.list({ force: true });
  assert.equal(client.getPhase(), 'loading');
  const snap = await p;
  assert.equal(snap.health, 'READY');
  assert.equal(snap.events.length, 1);
  assert.equal(client.getPhase(), 'ready');
  assert.equal(calls, 1);

  const bad = createWorldEventsClient({
    fetchImpl: async () => {
      throw new Error('network down');
    },
  });
  const offline = await bad.list({ force: true });
  assert.equal(offline.health, 'OFFLINE');
  assert.equal(offline.events.length, 0);
  assert.ok(offline.error);
});
