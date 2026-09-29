import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIncidentWorkspace,
  distanceKm,
  INCIDENT_EVENT_LAYERS,
} from './incidentWorkspace.js';

test('distanceKm is null for bad coords and finite for Austin–Dallas-ish', () => {
  assert.equal(distanceKm(NaN, 0, 0, 0), null);
  const d = distanceKm(30.27, -97.74, 32.78, -96.8);
  assert.ok(d > 240 && d < 320, `got ${d}`);
});

test('refuses unsupported layers and missing coords without inventing', () => {
  assert.equal(buildIncidentWorkspace({ subject: { layerId: 'traffic', id: 'x', latitude: 1, longitude: 2 } }).ok, false);
  assert.equal(
    buildIncidentWorkspace({
      subject: { layerId: 'earthquakes', id: 'q1', latitude: NaN, longitude: 0 },
    }).code,
    'NO_COORDINATES',
  );
});

test('nearby cameras and flights are labelled related≠causal and radius-bounded', () => {
  const brief = buildIncidentWorkspace({
    subject: {
      id: 'eq1',
      layerId: 'earthquakes',
      label: 'M4.2',
      latitude: 30.27,
      longitude: -97.74,
      provider: 'USGS',
      classification: 'NEAR LIVE',
    },
    cameras: [
      { id: 'near', name: 'Near cam', lat: 30.28, lon: -97.74, provider: 'City' },
      { id: 'far', name: 'Far cam', lat: 40, lon: -100, provider: 'City' },
      { id: 'bad', name: 'No coords', provider: 'City' },
    ],
    flights: [
      { id: 'N1', callsign: 'TEST1', lat: 30.3, lon: -97.7 },
      { id: 'N2', callsign: 'FAR', lat: 50, lon: 0 },
    ],
    radiusKm: 50,
    limit: 10,
    builtAt: '2026-09-29T08:00:00.000Z',
  });
  assert.equal(brief.ok, true);
  assert.equal(brief.counts.cameras, 1);
  assert.equal(brief.nearby.cameras[0].id, 'near');
  assert.equal(brief.nearby.cameras[0].causal, false);
  assert.equal(brief.nearby.cameras[0].relation, 'nearby');
  assert.match(brief.nearby.cameras[0].note, /not evidence/i);
  assert.equal(brief.counts.flights, 1);
  assert.equal(brief.nearby.flights[0].causal, false);
  assert.match(brief.disclaimer, /Related ≠ causal/);
  assert.ok(INCIDENT_EVENT_LAYERS.includes('weather-alerts'));
});

test('limit clamps and sorts by distance', () => {
  const cams = Array.from({ length: 20 }, (_, i) => ({
    id: `c${i}`,
    lat: 30.27 + i * 0.01,
    lon: -97.74,
  }));
  const brief = buildIncidentWorkspace({
    subject: { id: 'f1', layerId: 'local-firms', latitude: 30.27, longitude: -97.74 },
    cameras: cams,
    limit: 3,
    radiusKm: 100,
  });
  assert.equal(brief.nearby.cameras.length, 3);
  assert.deepEqual(
    brief.nearby.cameras.map((c) => c.id),
    ['c0', 'c1', 'c2'],
  );
});
