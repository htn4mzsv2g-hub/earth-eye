import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMS_PROVIDERS,
  COMMS_LAYER_ID,
  COMMS_HARD_EXCLUSIONS,
  commsProviderHeld,
  commsAudioBlocked,
  commsNeedsCredentialPayload,
} from './providers.js';

test('COMMS layer reuses radio id (no rewrite)', () => {
  assert.equal(COMMS_LAYER_ID, 'radio');
});

test('Broadcastify is NEEDS_CREDENTIAL with license-review held (no apply)', () => {
  const b = COMMS_PROVIDERS.find((p) => p.id === 'comms-broadcastify');
  assert.ok(b);
  assert.equal(b.status, 'NEEDS_CREDENTIAL');
  assert.equal(b.licenseReview, 'held');
  assert.equal(b.scrape, false);
  assert.equal(b.fakeCatalog, false);
  assert.equal(b.display, false);
  assert.match(b.evidence, /HELD|Do not email|do not apply/i);
  assert.equal(commsProviderHeld(b), true);
});

test('LiveATC audio stays blocked', () => {
  const live = COMMS_PROVIDERS.find((p) => p.id === 'comms-liveatc');
  assert.equal(live.status, 'BLOCKED_BY_PROVIDER_TERMS');
  assert.equal(live.audio, 'blocked');
  assert.equal(commsAudioBlocked(live), true);
});

test('OpenMHz and RadioReference stay held', () => {
  const om = COMMS_PROVIDERS.find((p) => p.id === 'comms-openmhz');
  const rr = COMMS_PROVIDERS.find((p) => p.id === 'comms-radioreference');
  assert.equal(om.status, 'PERMISSION_REQUIRED');
  assert.equal(rr.status, 'LICENSE_REQUIRED');
  assert.equal(commsProviderHeld(om), true);
  assert.equal(commsProviderHeld(rr), true);
});

test('needs-credential payload never invents feeds', () => {
  const body = commsNeedsCredentialPayload('comms-broadcastify');
  assert.equal(body.ok, false);
  assert.equal(body.code, 'NEEDS_CREDENTIAL');
  assert.equal(body.licenseReview, 'held');
  assert.deepEqual(body.feeds, []);
  assert.equal(Object.isFrozen(body.feeds), true);
});

test('hard exclusions include ALPR, simulated traffic, LiveATC audio', () => {
  for (const id of ['alpr-cameras', 'traffic', 'simulated-traffic', 'liveatc-audio']) {
    assert.ok(COMMS_HARD_EXCLUSIONS.includes(id), id);
  }
});

test('local SDR is hardware extension only', () => {
  const sdr = COMMS_PROVIDERS.find((p) => p.id === 'comms-local-sdr');
  assert.equal(sdr.status, 'LOCAL_HARDWARE');
  assert.equal(sdr.audio, 'local');
});
