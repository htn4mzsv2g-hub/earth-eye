import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANONICAL_DESTINATIONS,
  DESKTOP_MORE_ITEMS,
  DESKTOP_PRIMARY,
  canonicalLabels,
  destinationOwning,
} from './canonicalIa.js';

test('canonical destinations are GLOBE TRACK CAMERAS ANALYST MORE', () => {
  assert.deepEqual(canonicalLabels(), [
    'GLOBE',
    'TRACK',
    'CAMERAS',
    'ANALYST',
    'MORE',
  ]);
  assert.equal(CANONICAL_DESTINATIONS.length, 5);
});

test('GLOBE owns map layers search location context world-events', () => {
  for (const s of ['map', 'layers', 'search', 'location', 'context', 'world-events'])
    assert.equal(destinationOwning(s), 'globe', s);
});

test('TRACK owns aircraft military vessels satellites launches nearby', () => {
  for (const s of [
    'aircraft',
    'military',
    'vessels',
    'satellites',
    'launches',
    'nearby',
  ])
    assert.equal(destinationOwning(s), 'track', s);
});

test('desktop primary uses same destination labels and opens track/cctv/analyst/explore', () => {
  assert.deepEqual(
    DESKTOP_PRIMARY.map((d) => d.label),
    ['GLOBE', 'TRACK', 'CAMERAS', 'ANALYST'],
  );
  assert.deepEqual(
    DESKTOP_PRIMARY.map((d) => d.open),
    ['explore', 'track', 'cctv', 'analyst'],
  );
});

test('desktop MORE maps events sources keys licenses safety snap tour', () => {
  assert.deepEqual(
    DESKTOP_MORE_ITEMS.map((d) => d.label),
    ['EVENTS', 'SOURCES', 'KEYS', 'LICENSES', 'SAFETY', 'SNAP', 'TOUR'],
  );
  assert.equal(
    DESKTOP_MORE_ITEMS.find((d) => d.id === 'keys').ownerPreferred,
    true,
  );
});
