import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('./mobileShell.js', import.meta.url), 'utf8');
const cctv = readFileSync(new URL('./cctvBrowser.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./mobile.css', import.meta.url), 'utf8');
const track = readFileSync(new URL('./trackWorkspace.js', import.meta.url), 'utf8');
const flights = readFileSync(
  new URL('../layers/flights/tracking.js', import.meta.url),
  'utf8',
);

test('globe gestures restore when overlay clears', () => {
  assert.match(shell, /ee:globe-gestures-restore/);
  assert.match(shell, /overlayOpen/);
  assert.match(shell, /forceSyncClearOverlay/);
  assert.match(shell, /scrubOrphanSheetHosts/);
  assert.match(shell, /pageshow/);
  assert.match(shell, /ee:force-overlay-clear/);
  assert.match(shell, /data-ee-action="diagnostics"/);
  assert.match(css, /:not\(\[data-ee-overlay\]\) #cesiumContainer canvas/);
  assert.match(css, /height: var\(--ee-sheet-max\)/);
});

test('cameras list is primary; filters are secondary details', () => {
  assert.match(cctv, /ee-cam-primary/);
  assert.match(cctv, /ee-cam-filters/);
  const primary = cctv.indexOf('ee-cam-primary');
  const filters = cctv.indexOf('ee-cam-filters');
  assert.ok(primary > 0 && filters > primary);
});

test('TRACK nearest uses getNearby + flyTo', () => {
  assert.match(track, /getNearby/);
  assert.match(track, /flyTo/);
  assert.match(track, /Nearest/);
});

test('SELECT-only clears on empty globe click', () => {
  assert.match(flights, /SELECT-only \(no FOLLOW\)/);
  assert.match(flights, /gev:awareness-subject-cleared/);
});

test('MORE no longer duplicates EXPLORE (ASK is primary)', () => {
  // EE-LIVE-2: LOCATION/CONTEXT live under MORE → GLOBE; place search stays ASK.
  assert.match(shell, /Place search: ASK EARTH EYE/);
  assert.match(shell, /data-group="globe"/);
  assert.doesNotMatch(shell, /data-atlas-open="explore"/);
  assert.doesNotMatch(
    shell,
    /data-group="information"[\s\S]*data-atlas-open="explore"/,
  );
});
