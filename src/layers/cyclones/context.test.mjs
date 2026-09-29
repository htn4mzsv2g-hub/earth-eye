import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classificationName,
  cycloneTemporalStatus,
  cycloneContextId,
  buildCycloneContextProperties,
  publishCycloneSelection,
  clearCycloneContext,
} from './context.js';

test('HU means Hurricane', () => {
  assert.equal(classificationName('HU'), 'Hurricane');
  assert.equal(classificationName('TS'), 'Tropical storm');
});

test('Polo-like advisory is pending when geometryStatus pending', () => {
  const storm = {
    id: 'ep172026',
    name: 'Polo',
    classification: 'HU',
    geometryStatus: 'pending',
    issuedAt: '2026-09-29T03:00:00.000Z',
  };
  assert.equal(cycloneTemporalStatus(storm, { stale: false }), 'pending');
  assert.equal(cycloneTemporalStatus(storm, { stale: true }), 'stale');
});

test('publishCycloneSelection registers shared context for Analyst/detail', () => {
  globalThis.window = globalThis;
  if (typeof globalThis.CustomEvent !== 'function') {
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
  }
  if (typeof globalThis.dispatchEvent !== 'function') {
    globalThis.dispatchEvent = () => true;
  }
  if (typeof globalThis.addEventListener !== 'function') {
    globalThis.addEventListener = () => {};
  }
  clearCycloneContext();
  const storm = {
    id: 'ep172026',
    name: 'Polo',
    classification: 'HU',
    basin: 'EP',
    advisoryNumber: '34',
    issuedAt: '2026-09-29T03:00:00.000Z',
    positionAt: '2026-09-29T06:00:00.000Z',
    windKt: 95,
    pressureHpa: 965,
    position: { latitude: 25.9, longitude: -112.2 },
    advisoryUrl: 'https://www.nhc.noaa.gov/text/MIATCMEP2.shtml',
    geometryStatus: 'pending',
  };
  const rec = publishCycloneSelection(storm, { stale: false });
  assert.ok(rec);
  assert.equal(rec.id, cycloneContextId('ep172026'));
  assert.equal(rec.properties.temporalStatus, 'pending');
  assert.equal(rec.properties.windKt, 95);
  assert.match(rec.properties.note, /pending/i);
  const props = buildCycloneContextProperties(storm, { stale: false });
  assert.equal(props.classificationName, 'Hurricane');
  clearCycloneContext();
});
