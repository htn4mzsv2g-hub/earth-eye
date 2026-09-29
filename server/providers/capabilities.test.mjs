import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCapabilities,
  capabilitiesAreSanitized,
  CAPABILITY_STATUSES,
} from './capabilities.js';

test('capabilities are sanitized labels with allowed statuses only', () => {
  const payload = buildCapabilities({});
  assert.equal(payload.ok, true);
  assert.equal(capabilitiesAreSanitized(payload), true);
  const byId = Object.fromEntries(payload.capabilities.map((c) => [c.id, c]));
  assert.equal(
    byId['google-photorealistic-3d'].label,
    'GOOGLE PHOTOREALISTIC 3D',
  );
  assert.equal(byId['google-photorealistic-3d'].status, 'NOT CONFIGURED');
  assert.equal(byId.vessels.status, 'KEY REQUIRED');
  assert.equal(byId['voice-ai'].status, 'NOT CONFIGURED');
  assert.equal(byId['nasa-firms'].status, 'DEGRADED');
  assert.equal(byId.openai.status, 'DISABLED');
  assert.equal(byId['world-events'].label, 'WORLD EVENTS');
  assert.equal(byId['world-events'].status, 'AVAILABLE');
  for (const row of payload.capabilities)
    assert.ok(CAPABILITY_STATUSES.includes(row.status), row.status);
});

test('capabilities reflect presence without leaking env names', () => {
  const payload = buildCapabilities({
    GOOGLE_MAPS_API_KEY: 'AIzaSyFakeKeyForTestOnly000',
    AISSTREAM_API_KEY: 'ais-test',
    OPENAI_API_KEY: 'sk-test',
    FIRMS_MAP_KEY: 'firms',
    EE_OPENAI_ANALYST: '1',
  });
  assert.equal(capabilitiesAreSanitized(payload), true);
  const byId = Object.fromEntries(payload.capabilities.map((c) => [c.id, c]));
  assert.equal(byId['google-photorealistic-3d'].status, 'AVAILABLE');
  assert.equal(byId.vessels.status, 'AVAILABLE');
  assert.equal(byId['voice-ai'].status, 'AVAILABLE');
  assert.equal(byId['nasa-firms'].status, 'AVAILABLE');
  assert.equal(byId.openai.status, 'AVAILABLE');
  const blob = JSON.stringify(payload);
  assert.doesNotMatch(blob, /GOOGLE_MAPS_API_KEY/);
  assert.doesNotMatch(blob, /AISSTREAM/);
  assert.doesNotMatch(blob, /OPENAI_API_KEY/);
  assert.doesNotMatch(blob, /sk-test/);
  assert.doesNotMatch(blob, /AIzaSy/);
});
