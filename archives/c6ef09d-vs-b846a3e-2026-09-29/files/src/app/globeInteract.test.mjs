import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureGlobeInteractive,
  installCameraInteractRenderHold,
  installRenderLoopGuard,
  CAMERA_INTERACT_HOLD_ID,
} from './globeInteract.js';
import {
  installRenderGovernor,
  getRenderGovernorDiagnostics,
  _resetRenderGovernorForTest,
} from '../renderGovernor.js';

function makeDoc({ cockpit = false, overlay = false, sheetHost = false } = {}) {
  const canvas = {
    tagName: 'CANVAS',
    style: { pointerEvents: 'none', touchAction: '' },
    addEventListener() {},
    removeEventListener() {},
  };
  const container = {
    id: 'cesiumContainer',
    style: { touchAction: '' },
  };
  const loading = {
    id: 'loading-screen',
    style: { pointerEvents: 'auto' },
    classList: { add() {} },
    setAttribute() {},
    dataset: {},
    remove() {
      loading._removed = true;
    },
    closest() {
      return loading;
    },
  };
  const nodes = [loading];
  const html = {
    dataset: overlay ? { eeOverlay: 'open' } : {},
    hasAttribute(name) {
      return name === 'data-ee-overlay' ? overlay : false;
    },
    removeAttribute(name) {
      if (name === 'data-ee-overlay') overlay = false;
    },
  };
  const body = {
    classList: {
      contains(c) {
        return c === 'cockpit-mode' && cockpit;
      },
    },
  };
  return {
    documentElement: html,
    body,
    hidden: false,
    getElementById(id) {
      if (id === 'loading-screen') return loading._removed ? null : loading;
      if (id === 'cesiumContainer') return container;
      return null;
    },
    querySelector(sel) {
      if (sel === '#cesiumContainer canvas') return canvas;
      if (sel === '.ee-sheet-host, #ee-cam-viewer:not([hidden])')
        return sheetHost ? { id: 'sheet' } : null;
      if (sel === '.ee-sheet-host') return sheetHost ? { id: 'sheet' } : null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel.includes('loading-screen') || sel.includes('loader-content'))
        return loading._removed ? [] : nodes;
      return [];
    },
    _canvas: canvas,
    _container: container,
    _loading: loading,
  };
}

function makeViewer({ enableInputs = false } = {}) {
  const ctl = {
    enableInputs,
    enableRotate: false,
    enableTranslate: false,
    enableZoom: false,
    enableTilt: false,
    enableLook: false,
  };
  return {
    useDefaultRenderLoop: true,
    canvas: { addEventListener() {}, removeEventListener() {} },
    scene: {
      screenSpaceCameraController: ctl,
      requestRender() {
        this._rr = (this._rr || 0) + 1;
      },
    },
    _ctl: ctl,
  };
}

test('ensureGlobeInteractive restores enable* and pe/touch-action', () => {
  const doc = makeDoc();
  const viewer = makeViewer({ enableInputs: false });
  const got = ensureGlobeInteractive({ viewer, document: doc });
  assert.equal(got.ok, true);
  assert.equal(viewer._ctl.enableInputs, true);
  assert.equal(viewer._ctl.enableRotate, true);
  assert.equal(doc._canvas.style.pointerEvents, 'auto');
  assert.equal(doc._canvas.style.touchAction, 'none');
  assert.equal(doc._container.style.touchAction, 'none');
  assert.equal(doc._loading._removed, true);
});

test('ensureGlobeInteractive skips enableInputs in cockpit-mode', () => {
  const doc = makeDoc({ cockpit: true });
  const viewer = makeViewer({ enableInputs: false });
  ensureGlobeInteractive({ viewer, document: doc });
  assert.equal(viewer._ctl.enableInputs, false);
});

test('ensureGlobeInteractive re-enables useDefaultRenderLoop when visible', () => {
  const doc = makeDoc();
  const viewer = makeViewer();
  viewer.useDefaultRenderLoop = false;
  ensureGlobeInteractive({ viewer, document: doc });
  assert.equal(viewer.useDefaultRenderLoop, true);
});

test('installCameraInteractRenderHold toggles continuous hold', () => {
  _resetRenderGovernorForTest();
  const listeners = new Map();
  const canvas = {
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const scene = {
    requestRenderMode: true,
    requestRender() {},
  };
  const viewer = { canvas, scene };
  installRenderGovernor(viewer);
  assert.equal(getRenderGovernorDiagnostics().mode, 'idle');

  const winListeners = new Map();
  const fakeWin = {
    addEventListener(type, fn) {
      winListeners.set(type, fn);
    },
    removeEventListener(type) {
      winListeners.delete(type);
    },
  };
  const doc = {
    querySelector: () => canvas,
    defaultView: fakeWin,
  };

  // Re-bind with document that has defaultView
  const dispose = installCameraInteractRenderHold(viewer, { document: doc });
  assert.equal(typeof listeners.get('pointerdown'), 'function');
  listeners.get('pointerdown')({ button: 0 });
  assert.equal(getRenderGovernorDiagnostics().mode, 'continuous');
  assert.ok(
    getRenderGovernorDiagnostics().holds.includes(CAMERA_INTERACT_HOLD_ID),
  );
  winListeners.get('pointerup')();
  assert.equal(getRenderGovernorDiagnostics().mode, 'idle');
  dispose();
  _resetRenderGovernorForTest();
});

test('installRenderLoopGuard restores suspended loop on pageshow', () => {
  const handlers = {};
  const win = {
    addEventListener(type, fn) {
      handlers[type] = fn;
    },
  };
  const doc = makeDoc();
  const viewer = makeViewer();
  viewer.useDefaultRenderLoop = false;
  installRenderLoopGuard(viewer, { document: doc, window: win });
  assert.equal(typeof handlers.pageshow, 'function');
  handlers.pageshow();
  assert.equal(viewer.useDefaultRenderLoop, true);
});
