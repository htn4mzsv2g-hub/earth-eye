import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNwsAlertToWorldEvent } from './nwsAlert.js';
import { normalizeUsgsEarthquakeToWorldEvent } from './usgsEarthquake.js';
import { normalizeFirmsDetectionToWorldEvent } from './firmsDetection.js';
import { normalizeFirePerimeterToWorldEvent } from './firePerimeter.js';
import { normalizeCycloneToWorldEvent } from './cyclone.js';

test('NWS polygon alert uses polygon precision', () => {
  const ev = normalizeNwsAlertToWorldEvent({
    id: 'urn:poly:1',
    event: 'Tornado Warning',
    severity: 'Extreme',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-97.0, 30.0],
          [-97.1, 30.0],
          [-97.1, 30.1],
          [-97.0, 30.1],
          [-97.0, 30.0],
        ],
      ],
    },
  });
  assert.equal(ev.kind, 'OFFICIAL ALERT');
  assert.equal(ev.precision, 'polygon');
  assert.equal(ev.geometry.type, 'Polygon');
});

test('FIRMS detection is PUBLIC DATA OBSERVATION with source point', () => {
  const ev = normalizeFirmsDetectionToWorldEvent({
    lat: 38.99,
    lon: -121.67,
    frp: 12.5,
    confidence: 0.8,
    satellite: 'N20',
    acqMs: Date.UTC(2026, 8, 29, 12, 0),
  });
  assert.equal(ev.kind, 'PUBLIC DATA OBSERVATION');
  assert.equal(ev.precision, 'point');
  assert.equal(ev.coverage.confidence, 0.8);
  assert.equal(ev.severity, null);
  assert.match(ev.coverage.limits, /not a confirmed/i);
});

test('FIRMS without confidence does not invent it', () => {
  const ev = normalizeFirmsDetectionToWorldEvent({
    lat: 38.99,
    lon: -121.67,
    acqMs: Date.UTC(2026, 8, 29, 12, 0),
  });
  assert.equal(ev.coverage.confidence, null);
});

test('fire perimeter without polygons stays region', () => {
  const ev = normalizeFirePerimeterToWorldEvent({
    stableId: '2026-TXABC-001',
    name: 'Example Fire',
    county: 'Travis',
    state: 'TX',
    polygons: [],
  });
  assert.equal(ev.precision, 'region');
  assert.equal(ev.geometry.type, 'Region');
});

test('cyclone with advisory center point', () => {
  const ev = normalizeCycloneToWorldEvent({
    id: 'AL092026',
    name: 'TEST',
    classification: 'TS',
    basin: 'AL',
    position: { longitude: -60.5, latitude: 22.1 },
    positionAt: '2026-09-29T06:00:00.000Z',
    issuedAt: '2026-09-29T06:00:00.000Z',
    windKt: 50,
    geometryStatus: 'pending',
    advisoryUrl: 'https://www.nhc.noaa.gov/text/refresh/example',
  });
  assert.equal(ev.kind, 'OFFICIAL ALERT');
  assert.equal(ev.precision, 'point');
  assert.equal(ev.severity.value, 50);
});

test('USGS rejects nothing when id missing', () => {
  assert.equal(normalizeUsgsEarthquakeToWorldEvent({ mag: 3 }), null);
});
