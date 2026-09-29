import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_DETAIL_LAYERS,
  requestEventDetail,
  temporalStatusFromAgeMs,
} from './eventDetail.js';

test('event detail layers cover cyclone, fire, quake, perimeter', () => {
  assert.deepEqual(
    [...EVENT_DETAIL_LAYERS].sort(),
    ['earthquakes', 'fire-perimeters', 'local-firms', 'weather-alerts', 'weather-cyclones'].sort(),
  );
});

test('temporalStatusFromAgeMs never invents current from missing age', () => {
  assert.equal(temporalStatusFromAgeMs(NaN), 'unknown');
  assert.equal(temporalStatusFromAgeMs(1000), 'current');
  assert.equal(temporalStatusFromAgeMs(40e5), 'stale');
});

test('requestEventDetail dispatches for known layers only', () => {
  globalThis.window = globalThis;
  const seen = [];
  if (typeof globalThis.CustomEvent !== 'function') {
    globalThis.CustomEvent = class {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
  }
  globalThis.dispatchEvent = (ev) => {
    seen.push(ev);
    return true;
  };
  assert.equal(requestEventDetail('weather-cyclones', { stormId: 'ep172026' }), true);
  assert.equal(seen[0].type, 'gev:event-detail-request');
  assert.equal(seen[0].detail.stormId, 'ep172026');
  assert.equal(requestEventDetail('traffic', {}), false);
});
