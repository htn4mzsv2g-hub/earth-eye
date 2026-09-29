import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMAND_STATUS,
  commandStatusFromResult,
  earthEyeIdentity,
} from './analystIdentity.js';

test('earthEyeIdentity: id + type + source from context record', () => {
  const id = earthEyeIdentity({
    id: 'flights:a1b2c3',
    layerId: 'flights',
    providerId: 'a1b2c3',
    label: 'UAL123',
    provider: 'ADS-B',
    latitude: 30.27,
    longitude: -97.74,
  });
  assert.equal(id.id, 'flights:a1b2c3');
  assert.equal(id.type, 'flights');
  assert.equal(id.source, 'ADS-B');
  assert.equal(id.providerId, 'a1b2c3');
  assert.equal(id.lat, 30.27);
  assert.equal(id.lon, -97.74);
});

test('earthEyeIdentity: camera catalog id stays provider-qualified', () => {
  const id = earthEyeIdentity({
    id: 'txdot:cam-9',
    layerId: 'cctv',
    label: 'I-35 @ 6th',
    provider: 'TxDOT',
    lat: 30.26,
    lon: -97.74,
  });
  assert.equal(id.id, 'txdot:cam-9');
  assert.equal(id.type, 'cctv');
  assert.equal(id.source, 'TxDOT');
});

test('earthEyeIdentity: null/empty refused', () => {
  assert.equal(earthEyeIdentity(null), null);
  assert.equal(earthEyeIdentity({}), null);
});

test('commandStatusFromResult: SUCCESS / PARTIAL / FAILED / UNAVAILABLE', () => {
  assert.equal(
    commandStatusFromResult({ ok: true, items: [{ id: 1 }] }),
    COMMAND_STATUS.SUCCESS,
  );
  assert.equal(
    commandStatusFromResult({ ok: true, items: [{ id: 1 }], total: 5 }),
    COMMAND_STATUS.PARTIAL,
  );
  assert.equal(
    commandStatusFromResult({ ok: false, error: 'boom' }),
    COMMAND_STATUS.FAILED,
  );
  assert.equal(
    commandStatusFromResult(
      { ok: true, items: [] },
      { layerDisplayOff: true },
    ),
    COMMAND_STATUS.UNAVAILABLE,
  );
  assert.equal(
    commandStatusFromResult({ ok: true, items: [] }, { capabilityOff: true }),
    COMMAND_STATUS.UNAVAILABLE,
  );
  assert.equal(
    commandStatusFromResult({ ok: false, error: 'AI off / not configured' }),
    COMMAND_STATUS.UNAVAILABLE,
  );
});
