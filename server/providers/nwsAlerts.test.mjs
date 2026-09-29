import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNwsAlert } from './nwsAlerts.js';

test('normalizeNwsAlert keeps geometry null honestly', () => {
  const row = normalizeNwsAlert({
    properties: {
      id: 'urn:test:1',
      event: 'Flood Watch',
      severity: 'Severe',
      urgency: 'Future',
      certainty: 'Possible',
      headline: 'Flood Watch',
      areaDesc: 'Dallas',
      senderName: 'NWS Fort Worth TX',
      status: 'Actual',
      onset: '2026-09-30T16:00:00-05:00',
      ends: '2026-10-01T13:00:00-05:00',
      expires: '2026-09-29T13:45:00-05:00',
    },
    geometry: null,
  });
  assert.equal(row.event, 'Flood Watch');
  assert.equal(row.geometry, null);
  assert.equal(row.senderName, 'NWS Fort Worth TX');
  assert.ok(row.sourceUrl);
});

test('normalizeNwsAlert drops empty id', () => {
  assert.equal(normalizeNwsAlert({ properties: {} }), null);
});
