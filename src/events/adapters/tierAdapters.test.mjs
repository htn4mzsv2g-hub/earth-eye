import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGdacsFeatureToWorldEvent } from './gdacs.js';
import { normalizeGdeltArticleToWorldEvent } from './gdelt.js';
import { reliefWebAdapterDescriptor } from './reliefweb.js';
import {
  permissionHeldResult,
  needsKeyResult,
  rateLimitedResult,
  offlineResult,
  EVENT_HEALTH,
} from '../worldEventContract.js';

test('GDACS red alert is OFFICIAL ALERT with source point', () => {
  const ev = normalizeGdacsFeatureToWorldEvent({
    type: 'Feature',
    properties: {
      eventid: 1001067,
      eventtype: 'EQ',
      name: 'Earthquake Test',
      alertlevel: 'Red',
      alertscore: 2.1,
      country: 'Testland',
      fromdate: '2026-09-28T00:00:00Z',
      url: { report: 'https://www.gdacs.org/report.aspx?eventid=1001067' },
    },
    geometry: { type: 'Point', coordinates: [10.5, 45.2] },
  });
  assert.equal(ev.kind, 'OFFICIAL ALERT');
  assert.equal(ev.precision, 'point');
  assert.equal(ev.geometry.type, 'Point');
  assert.match(ev.attribution.credit, /GDACS/);
  assert.match(ev.coverage.limits, /does not replace/i);
});

test('GDACS green without geometry stays region when country present', () => {
  const ev = normalizeGdacsFeatureToWorldEvent({
    properties: {
      eventid: 99,
      eventtype: 'FL',
      name: 'Flood',
      alertlevel: 'Green',
      country: 'Italy',
    },
  });
  assert.equal(ev.kind, 'HUMANITARIAN REPORT');
  assert.equal(ev.precision, 'region');
  assert.equal(ev.geometry.type, 'Region');
  assert.equal(ev.geometry.coordinates, null);
});

test('GDELT article is NEWS REPORT with region precision only', () => {
  const ev = normalizeGdeltArticleToWorldEvent({
    url: 'https://news.example.com/quake-hits-region',
    title: 'Quake hits region',
    seendate: '20260929T120000Z',
    sourcecountry: 'United States',
    language: 'English',
  });
  assert.equal(ev.kind, 'NEWS REPORT');
  assert.equal(ev.precision, 'region');
  assert.notEqual(ev.geometry?.type, 'Point');
  assert.equal(ev.severity, null);
  assert.match(ev.coverage.limits, /not an official alert/i);
});

test('GDELT never invents point from city context', () => {
  const ev = normalizeGdeltArticleToWorldEvent(
    {
      url: 'https://news.example.com/a',
      title: 'Flooding reported',
      sourcecountry: 'France',
    },
    { queryPlace: 'Paris' },
  );
  assert.equal(ev.precision, 'region');
  assert.equal(ev.geometry.type, 'Region');
  assert.equal(ev.geometry.coordinates, null);
});

test('ReliefWeb descriptor is PERMISSION HELD hook only', () => {
  assert.equal(reliefWebAdapterDescriptor.status, 'HOOK_ONLY');
  assert.equal(reliefWebAdapterDescriptor.permission, 'PERMISSION HELD');
  assert.equal(reliefWebAdapterDescriptor.normalize, null);
  assert.match(reliefWebAdapterDescriptor.notes, /do not scrape/i);
});

test('failure envelopes are honest and never silent LIVE', () => {
  assert.ok(EVENT_HEALTH.includes('PERMISSION HELD'));
  assert.ok(EVENT_HEALTH.includes('NEEDS KEY'));
  assert.ok(EVENT_HEALTH.includes('RATE LIMITED'));
  assert.ok(EVENT_HEALTH.includes('TERMS UNCLEAR'));

  const held = permissionHeldResult({ adapterId: 'reliefweb', source: 'ReliefWeb' });
  assert.equal(held.health, 'PERMISSION HELD');
  assert.equal(held.events.length, 0);

  const key = needsKeyResult({ adapterId: 'nasa-firms', source: 'NASA FIRMS' });
  assert.equal(key.health, 'NEEDS KEY');

  const rl = rateLimitedResult({ adapterId: 'gdelt' });
  assert.equal(rl.health, 'RATE LIMITED');

  const off = offlineResult({ adapterId: 'gdacs' });
  assert.equal(off.health, 'OFFLINE');
});
