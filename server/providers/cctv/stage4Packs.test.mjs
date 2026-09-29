import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHpwrenSitesJs } from './sources.js';
import { packAllowed, packStatusLabel } from './permissions.js';

test('parseHpwrenSitesJs reads quoted sites object', () => {
  const sites = parseHpwrenSitesJs(
    'var sites = { "bh": { "name": "Boucher", "lat": 33.3, "long": -116.9, "cams": { "bh-n": { "name": "N" } } } };',
  );
  assert.ok(sites.bh);
  assert.equal(sites.bh.lat, 33.3);
  assert.ok(sites.bh.cams['bh-n']);
});

test('NC packs stay off under commercial-safe mode even when env enabled', () => {
  const env = {
    EE_COMMERCIAL_SAFE: '1',
    CCTV_ALERTCALIFORNIA_ENABLED: '1',
    CCTV_HPWREN_ENABLED: '1',
  };
  assert.equal(packAllowed('alertcalifornia', env), false);
  assert.equal(packAllowed('hpwren', env), false);
  assert.equal(packStatusLabel('alertcalifornia', env), 'OFF (COMMERCIAL-SAFE)');
});

test('pending packs enable with env when not commercial-safe', () => {
  const env = {
    CCTV_LAKECOUNTY_ENABLED: '1',
    CCTV_SINGAPORE_ENABLED: '1',
  };
  assert.equal(packAllowed('lakecounty', env), true);
  assert.equal(packAllowed('singapore', env), true);
  assert.equal(packAllowed('lakecounty', {}), false);
});
