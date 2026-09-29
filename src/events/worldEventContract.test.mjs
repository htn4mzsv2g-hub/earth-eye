import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_KINDS,
  GEOMETRY_PRECISIONS,
  validateWorldEvent,
  createWorldEvent,
  qualifyEventId,
  precisionAllowsPoint,
  isImpreciseGeography,
  emptyEventResult,
  notWiredEventResult,
  permissionHeldResult,
  needsKeyResult,
  EVENT_HEALTH,
} from './worldEventContract.js';

test('EVENT_KINDS matches Earth Eye vocabulary', () => {
  assert.deepEqual(
    [...EVENT_KINDS],
    [
      'OFFICIAL ALERT',
      'OFFICIAL REPORT',
      'HUMANITARIAN REPORT',
      'NEWS REPORT',
      'PUBLIC DATA OBSERVATION',
      'EARTH EYE ANALYSIS',
    ],
  );
});

test('GEOMETRY_PRECISIONS includes imprecise region', () => {
  assert.ok(GEOMETRY_PRECISIONS.includes('region'));
  assert.ok(GEOMETRY_PRECISIONS.includes('point'));
  assert.equal(precisionAllowsPoint('point'), true);
  assert.equal(precisionAllowsPoint('region'), false);
  assert.equal(isImpreciseGeography('region'), true);
  assert.equal(isImpreciseGeography('point'), false);
});

test('qualifyEventId is provider-qualified', () => {
  assert.equal(qualifyEventId('usgs', 'us7000abc'), 'usgs:us7000abc');
  assert.equal(qualifyEventId('usgs', 'usgs:us7000abc'), 'usgs:us7000abc');
  assert.throws(() => qualifyEventId('', 'x'));
});

test('validateWorldEvent accepts a minimal official alert', () => {
  const result = validateWorldEvent({
    eventId: 'nws:urn:test:1',
    kind: 'OFFICIAL ALERT',
    sources: ['NWS'],
    precision: 'region',
    geometry: { type: 'Region', name: 'Dallas County' },
    retrievedAt: '2026-09-29T11:00:00.000Z',
  });
  assert.equal(result.ok, true);
  assert.equal(result.event.kind, 'OFFICIAL ALERT');
  assert.equal(result.event.precision, 'region');
  assert.equal(result.event.geometry.type, 'Region');
  assert.equal(result.event.severity, null);
  assert.match(result.event.related.note, /not causal/i);
});

test('validateWorldEvent rejects unknown kind', () => {
  const result = validateWorldEvent({
    eventId: 'x:1',
    kind: 'INCIDENT',
    sources: ['x'],
    precision: 'unknown',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /kind/.test(e)));
});

test('validateWorldEvent rejects unqualified eventId', () => {
  const result = validateWorldEvent({
    eventId: 'bare-id',
    kind: 'NEWS REPORT',
    sources: ['gdelt'],
    precision: 'unknown',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /provider-qualified/.test(e)));
});

test('precision rules: no invented precise points from city-level region', () => {
  const result = validateWorldEvent({
    eventId: 'gdelt:news-1',
    kind: 'NEWS REPORT',
    sources: ['GDELT'],
    precision: 'region',
    geometry: { type: 'Point', lon: -96.8, lat: 32.8 },
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => /invented precise|imprecise|Point/i.test(e)),
  );
});

test('precision rules: source-provided point is allowed', () => {
  const event = createWorldEvent({
    eventId: 'usgs:us7000xyz',
    kind: 'PUBLIC DATA OBSERVATION',
    sources: ['USGS'],
    precision: 'point',
    geometry: { lon: -98.5, lat: 30.2 },
    severity: { scale: 'USGS magnitude', value: 4.2, label: 'M4.2' },
  });
  assert.equal(event.geometry.type, 'Point');
  assert.deepEqual(event.geometry.coordinates, [-98.5, 30.2]);
  assert.equal(event.severity.value, 4.2);
});

test('severity stays null when not provided (never invent)', () => {
  const event = createWorldEvent({
    eventId: 'firms:1',
    kind: 'PUBLIC DATA OBSERVATION',
    sources: ['NASA FIRMS'],
    precision: 'point',
    geometry: { lon: -121.6, lat: 38.9 },
  });
  assert.equal(event.severity, null);
});

test('empty and notWired honest envelopes', () => {
  const empty = emptyEventResult({ adapterId: 'nws-alerts' });
  assert.equal(empty.health, 'EMPTY');
  assert.equal(empty.events.length, 0);
  assert.match(empty.reason, /nothing happened/i);

  const pending = notWiredEventResult({
    adapterId: 'gdacs',
    source: 'GDACS',
  });
  assert.equal(pending.health, 'NOT WIRED');
  assert.match(pending.reason, /not wired|hook registered/i);
});

test('related refs never mark causal true', () => {
  const event = createWorldEvent({
    eventId: 'nws:a',
    kind: 'OFFICIAL ALERT',
    sources: ['NWS'],
    precision: 'region',
    geometry: { type: 'Region', name: 'Travis County' },
    related: {
      cameras: [{ id: 'cam:1', label: 'Nearby', causal: true }],
      weather: ['wx:radar'],
    },
  });
  assert.equal(event.related.cameras[0].causal, false);
  assert.equal(event.related.weather[0].id, 'wx:radar');
  assert.equal(event.related.weather[0].causal, false);
});

test('EE-EVENTS-1 failure vocabulary present', () => {
  assert.ok(EVENT_HEALTH.includes('PERMISSION HELD'));
  assert.ok(EVENT_HEALTH.includes('NEEDS KEY'));
  assert.ok(EVENT_HEALTH.includes('RATE LIMITED'));
  assert.equal(permissionHeldResult({ adapterId: 'reliefweb' }).events.length, 0);
  assert.equal(needsKeyResult({ adapterId: 'nasa-firms' }).health, 'NEEDS KEY');
});
