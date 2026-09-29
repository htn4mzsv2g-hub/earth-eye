import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDiagnostics,
  diagnoseHealth,
  shouldAutoOpenDiagnostics,
  DIAG_QUERY_PARAM,
  getBuildId,
  getGitSha,
} from './eeDiagnostics.js';

test('diag query opens only for deliberate ee_diag', () => {
  assert.equal(shouldAutoOpenDiagnostics(''), false);
  assert.equal(shouldAutoOpenDiagnostics('?foo=1'), false);
  assert.equal(shouldAutoOpenDiagnostics('?ee_diag=1'), true);
  assert.equal(shouldAutoOpenDiagnostics('?ee_diag=true'), true);
  assert.equal(shouldAutoOpenDiagnostics(`?${DIAG_QUERY_PARAM}=yes`), true);
});

test('build metadata is public string (no secrets)', () => {
  const id = getBuildId();
  const sha = getGitSha();
  assert.equal(typeof id, 'string');
  assert.equal(typeof sha, 'string');
  assert.ok(id.length > 0);
  assert.doesNotMatch(id, /LOGIN_|SESSION_SECRET|API_KEY|password/i);
  assert.doesNotMatch(sha, /LOGIN_|SESSION_SECRET|API_KEY|password/i);
});

test('diagnoseHealth flags sticky overlay and disabled inputs', () => {
  const bad = diagnoseHealth({
    graphicsFailed: false,
    non3dQuery: false,
    non3dStorage: false,
    eeOverlay: 'open',
    canvasPointerEvents: 'none',
    enableInputs: false,
    cockpitActive: false,
    webglContextLost: false,
    viewerPresent: true,
    sheetHostOrphans: 'left-panel-stack',
    followLike: false,
  });
  assert.equal(bad.ok, false);
  assert.match(bad.note, /data-ee-overlay/);
  assert.match(bad.note, /pointer-events/);
  assert.match(bad.note, /enableInputs/);
  assert.match(bad.note, /orphan sheet-host/);

  const good = diagnoseHealth({
    graphicsFailed: false,
    non3dQuery: false,
    non3dStorage: false,
    eeOverlay: null,
    canvasPointerEvents: 'auto',
    enableInputs: true,
    cockpitActive: false,
    webglContextLost: false,
    viewerPresent: true,
    sheetHostOrphans: null,
    followLike: false,
    loadingScreenPresent: false,
    topElementCenter: 'canvas',
    postCloseHit: 'canvas',
  });
  assert.equal(good.ok, true);
  assert.match(good.note, /gesture response unverified/i);
  assert.doesNotMatch(good.note, /looks healthy for drag/i);

  const loaderBlocking = diagnoseHealth({
    graphicsFailed: false,
    non3dQuery: false,
    non3dStorage: false,
    eeOverlay: null,
    canvasPointerEvents: 'auto',
    enableInputs: true,
    cockpitActive: false,
    webglContextLost: false,
    viewerPresent: true,
    sheetHostOrphans: null,
    followLike: false,
    loadingScreenPresent: true,
    topElementCenter: 'div.loader-content',
    postCloseHit: 'div.loader-content',
  });
  assert.equal(loaderBlocking.ok, false);
  assert.match(loaderBlocking.note, /loading-screen still in DOM/);
  assert.match(loaderBlocking.note, /loader-content still hit-testable/);
});

test('collectDiagnostics returns safe shape without throwing', () => {
  const mockDoc = {
    documentElement: { classList: { contains: () => false }, getAttribute: () => null },
    body: { classList: { contains: () => false } },
    querySelector: () => null,
    getElementById: () => null,
    elementFromPoint: () => null,
  };
  const snap = collectDiagnostics({ viewer: null, document: mockDoc });
  assert.equal(typeof snap.buildId, 'string');
  assert.equal(snap.viewerPresent, false);
  assert.equal('enableInputs' in snap, true);
  assert.equal('eeOverlay' in snap, true);
  assert.equal('webglContextLost' in snap, true);
  assert.equal('loaderContentCount' in snap, true);
  assert.equal('topHitCenter' in snap, true);
  assert.equal('topHit25' in snap, true);
  assert.equal('topHit75' in snap, true);
  assert.equal('canvasPeAutoAncestors' in snap, true);
  assert.equal('peAutoOverCanvas' in snap, true);
  assert.equal('cameraNudge' in snap, true);
});

test('post-close probe records hit after DIAG would close', async () => {
  const { probeHitAfterDiagClose, getLastPostCloseHit, diagnoseHealth } =
    await import('./eeDiagnostics.js');
  const canvas = { tagName: 'CANVAS', id: '', className: '' };
  const mockDoc = {
    defaultView: { innerWidth: 390, innerHeight: 844 },
    elementFromPoint: () => canvas,
    elementsFromPoint: () => [canvas],
  };
  const result = probeHitAfterDiagClose(mockDoc);
  assert.equal(result.hit, 'canvas');
  assert.deepEqual(getLastPostCloseHit().stack, ['canvas']);
  const health = diagnoseHealth({
    graphicsFailed: false,
    non3dQuery: false,
    non3dStorage: false,
    eeOverlay: null,
    canvasPointerEvents: 'auto',
    enableInputs: true,
    cockpitActive: false,
    webglContextLost: false,
    viewerPresent: true,
    sheetHostOrphans: null,
    followLike: false,
    loadingScreenPresent: false,
    postCloseHit: result.hit,
    topElementCenter: 'aside#ee-diagnostics',
  });
  assert.equal(health.ok, true);
});

test('diagnoseHealth flags camera nudge stuck and loader-content count', () => {
  const stuck = diagnoseHealth({
    graphicsFailed: false,
    non3dQuery: false,
    non3dStorage: false,
    eeOverlay: null,
    canvasPointerEvents: 'auto',
    enableInputs: true,
    cockpitActive: false,
    webglContextLost: false,
    viewerPresent: true,
    sheetHostOrphans: null,
    followLike: false,
    loadingScreenPresent: false,
    loaderContentCount: 2,
    cameraNudge: 'camera-stuck',
    topHitCenter: 'canvas',
    postCloseHit: 'canvas',
  });
  assert.equal(stuck.ok, false);
  assert.match(stuck.note, /loader-content count/);
  assert.match(stuck.note, /camera nudge stuck/);
});
