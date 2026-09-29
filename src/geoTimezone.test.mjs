import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ianaTimezoneAt, localTimezoneTag } from './geoTimezone.js';

test('Austin late-September uses America/Chicago, never UTC-7 from lon/15', () => {
  assert.equal(ianaTimezoneAt(30.2672, -97.7431), 'America/Chicago');
  // 2026-09-29 12:00 UTC → CDT (UTC-5) in Austin
  const tag = localTimezoneTag(30.2672, -97.7431, Date.parse('2026-09-29T12:00:00Z'));
  assert.notEqual(tag, 'UTC-7');
  assert.notEqual(tag, 'UTC−7');
  assert.match(tag, /CDT|CST|GMT-5|UTC-5/);
});

test('San Francisco maps to Pacific; New York to Eastern', () => {
  assert.equal(ianaTimezoneAt(37.7749, -122.4194), 'America/Los_Angeles');
  assert.equal(ianaTimezoneAt(40.7128, -74.006), 'America/New_York');
});

test('invalid coords fall back to UTC', () => {
  assert.equal(ianaTimezoneAt(NaN, -97), 'UTC');
  assert.equal(localTimezoneTag(NaN, NaN), 'UTC');
});
