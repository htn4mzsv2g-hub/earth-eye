import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEventRegistry,
  ADAPTER_STATUS,
  ensureWorldEventsFoundation,
  resetDefaultEventRegistry,
  worldEventsStatus,
} from './index.js';
import { normalizeNwsAlertToWorldEvent } from './adapters/nwsAlert.js';
import { normalizeUsgsEarthquakeToWorldEvent } from './adapters/usgsEarthquake.js';

test('foundation registry registers existing adapters + tier hooks', () => {
  resetDefaultEventRegistry(null);
  const registry = ensureWorldEventsFoundation();
  const ids = registry
    .list()
    .map((a) => a.id)
    .sort();
  assert.deepEqual(ids, [
    'gdacs',
    'gdelt',
    'nasa-firms',
    'noaa-cyclones',
    'nws-alerts',
    'reliefweb',
    'usgs-earthquakes',
    'wfigs-perimeters',
  ]);
  assert.equal(registry.get('nws-alerts').status, ADAPTER_STATUS.ACTIVE);
  assert.equal(registry.get('gdacs').status, ADAPTER_STATUS.ACTIVE);
  assert.equal(registry.get('gdelt').status, ADAPTER_STATUS.ACTIVE);
  assert.equal(registry.get('reliefweb').status, ADAPTER_STATUS.HOOK_ONLY);
  assert.equal(registry.get('reliefweb').permission, 'PERMISSION HELD');
  assert.equal(registry.get('gdelt').kinds[0], 'NEWS REPORT');
});

test('registry health is honest about EE-EVENTS live foundation', () => {
  resetDefaultEventRegistry(null);
  const status = worldEventsStatus(() =>
    Date.parse('2026-09-29T11:05:00.000Z'),
  );
  assert.equal(status.ok, true);
  assert.equal(status.slice, 'EE-EVENTS-2');
  assert.equal(status.health, 'READY');
  assert.equal(status.summary.activeNormalizers, 7); // Tier A×5 + GDACS + GDELT
  assert.equal(status.summary.hookOnly, 1); // ReliefWeb
  assert.equal(status.summary.permissionHeld, 1);
  assert.match(status.note.liveFetches, /WIRED/);
  assert.match(status.note.liveFetches, /ReliefWeb PERMISSION HELD/);
  assert.match(status.note.authenticity, /News ≠ sensor|News/);
});

test('ReliefWeb HOOK_ONLY returns NOT WIRED without fetching', () => {
  resetDefaultEventRegistry(null);
  const registry = ensureWorldEventsFoundation();
  const result = registry.normalizeRecord('reliefweb', { id: 'x' });
  assert.equal(result.health, 'NOT WIRED');
  assert.equal(result.events.length, 0);
});

test('GDACS adapter via registry normalizes a feature', () => {
  resetDefaultEventRegistry(null);
  const registry = ensureWorldEventsFoundation();
  const result = registry.normalizeRecord('gdacs', {
    type: 'Feature',
    properties: {
      eventid: 42,
      eventtype: 'TC',
      name: 'Test Storm',
      alertlevel: 'Orange',
      country: 'Ocean',
      fromdate: '2026-09-29T00:00:00Z',
    },
    geometry: { type: 'Point', coordinates: [-60, 20] },
  });
  assert.equal(result.health, 'READY');
  assert.equal(result.events[0].kind, 'OFFICIAL ALERT');
});

test('normalizeMany empty snapshot is EMPTY not fabricated', () => {
  resetDefaultEventRegistry(null);
  const registry = ensureWorldEventsFoundation();
  const result = registry.normalizeMany('usgs-earthquakes', []);
  assert.equal(result.health, 'EMPTY');
  assert.equal(result.count, 0);
  assert.match(result.reason, /nothing happened/i);
});

test('NWS adapter via registry produces OFFICIAL ALERT', () => {
  resetDefaultEventRegistry(null);
  const registry = ensureWorldEventsFoundation();
  const result = registry.normalizeRecord(
    'nws-alerts',
    {
      id: 'urn:oid:test:flood',
      event: 'Flood Watch',
      severity: 'Severe',
      areaDesc: 'Dallas',
      onset: '2026-09-30T16:00:00-05:00',
      ends: '2026-10-01T13:00:00-05:00',
      expires: '2026-10-01T13:00:00-05:00',
      geometry: null,
      sourceUrl: 'https://api.weather.gov/alerts/urn:oid:test:flood',
      senderName: 'NWS Fort Worth TX',
    },
    { retrievedAt: '2026-09-29T11:00:00.000Z' },
  );
  assert.equal(result.health, 'READY');
  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.kind, 'OFFICIAL ALERT');
  assert.equal(ev.precision, 'region');
  assert.equal(ev.geometry.type, 'Region');
  assert.equal(ev.severity.label, 'Severe');
});

test('USGS adapter preserves source point; place-only stays region', () => {
  const withPoint = normalizeUsgsEarthquakeToWorldEvent({
    usgsId: 'us7000abc',
    lon: -98.1,
    lat: 30.4,
    mag: 3.5,
    depthKm: 10,
    place: '5 km N of Austin, TX',
    time: Date.parse('2026-09-29T10:00:00.000Z'),
  });
  assert.equal(withPoint.kind, 'PUBLIC DATA OBSERVATION');
  assert.equal(withPoint.precision, 'point');
  assert.equal(withPoint.geometry.type, 'Point');

  const placeOnly = normalizeUsgsEarthquakeToWorldEvent({
    id: 'us7000def',
    place: 'Dallas, TX',
    mag: 2.8,
  });
  assert.equal(placeOnly.precision, 'region');
  assert.equal(placeOnly.geometry.type, 'Region');
  assert.equal(placeOnly.geometry.coordinates, null);
});

test('createEventRegistry rejects duplicate ids', () => {
  const registry = createEventRegistry();
  registry.register({
    id: 'x',
    label: 'X',
    kinds: ['NEWS REPORT'],
    status: ADAPTER_STATUS.HOOK_ONLY,
  });
  assert.throws(() =>
    registry.register({
      id: 'x',
      label: 'X2',
      kinds: ['NEWS REPORT'],
      status: ADAPTER_STATUS.HOOK_ONLY,
    }),
  );
});

test('direct NWS normalizer never invents point from areaDesc', () => {
  const ev = normalizeNwsAlertToWorldEvent({
    id: 'urn:test:zone',
    event: 'Wind Advisory',
    severity: 'Minor',
    areaDesc: 'Travis; Williamson',
    geometry: null,
  });
  assert.equal(ev.precision, 'region');
  assert.notEqual(ev.geometry?.type, 'Point');
});
