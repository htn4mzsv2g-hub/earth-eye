import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('./mobileShell.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./mobile.css', import.meta.url), 'utf8');
const consoleJs = readFileSync(new URL('./console.js', import.meta.url), 'utf8');
const diag = readFileSync(
  new URL('../app/eeDiagnostics.js', import.meta.url),
  'utf8',
);

test('closeSheet and closeMore force-clear sticky data-ee-overlay', () => {
  assert.match(shell, /function forceSyncClearOverlay/);
  assert.match(shell, /function scrubOrphanSheetHosts/);
  assert.match(shell, /removeAttribute\('data-ee-overlay'\)/);
  // closeSheet path
  const closeIdx = shell.indexOf('function closeSheet');
  const closeChunk = shell.slice(closeIdx, closeIdx + 1200);
  assert.match(closeChunk, /forceSyncClearOverlay/);
  // closeMore path
  const moreIdx = shell.indexOf('function closeMore');
  assert.match(shell.slice(moreIdx, moreIdx + 500), /forceSyncClearOverlay/);
  // resume paths
  assert.match(shell, /pageshow/);
  assert.match(shell, /visibilitychange/);
});

test('canvas is blocked only while data-ee-overlay is present', () => {
  assert.match(
    css,
    /html\.ee-compact\[data-ee-overlay\] #cesiumContainer canvas \{[^}]*pointer-events: none !important/,
  );
  assert.match(
    css,
    /html\.ee-compact:not\(\[data-ee-overlay\]\) #cesiumContainer canvas \{[^}]*pointer-events: auto !important/,
  );
  assert.match(
    css,
    /html\.ee-compact:not\(\[data-ee-overlay\]\) #cesiumContainer canvas \{[^}]*touch-action: none !important/,
  );
});

test('gesture restore re-enables camera controller flags', () => {
  assert.match(consoleJs, /ctl\.enableInputs = true/);
  assert.match(consoleJs, /ctl\.enableRotate = true/);
  assert.match(consoleJs, /ctl\.enableTranslate = true/);
  assert.match(consoleJs, /ctl\.enableZoom = true/);
  assert.match(consoleJs, /ctl\.enableTilt = true/);
  assert.match(consoleJs, /cockpit-mode/);
});

test('diagnostics UI is owner-safe and discoverable', () => {
  assert.match(shell, /data-ee-action="diagnostics"/);
  assert.match(consoleJs, /ee:diagnostics-open/);
  assert.match(consoleJs, /shouldAutoOpenDiagnostics/);
  assert.match(diag, /NO credentials|Never includes credentials/i);
  assert.match(diag, /ee_diag/);
  assert.match(diag, /EE_BUILD_ID/);
  assert.doesNotMatch(diag, /LOGIN_PASS|SESSION_SECRET|REVIEWER_PASS/);
});

test('deliberate ee_non3d remains a query-only force (not storage alone)', () => {
  const recovery = readFileSync(
    new URL('../app/graphicsRecovery.js', import.meta.url),
    'utf8',
  );
  assert.match(recovery, /Only the URL query forces non-3D/);
  assert.match(recovery, /setForceNon3dFlag\(false/);
});
