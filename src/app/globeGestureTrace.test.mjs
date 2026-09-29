import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GESTURE_TRACE_KEY,
  ancestorStyleChain,
  cameraMoved,
  classifyAttempt,
  createGestureTraceStore,
  createGlobeGestureMonitor,
  renderDiagnosticText,
  targetLabel,
} from './globeGestureTrace.js';
import { publishBuildStamp, readMetaBuildId } from './buildStamp.js';
import { fillDiagnosticPanel } from './globeDiagnosticsPanel.js';

function memoryStorage() {
  const mem = new Map();
  return {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => mem.set(key, String(value)),
    removeItem: (key) => mem.delete(key),
  };
}

function el(tag, className = '', id = '') {
  return {
    nodeType: 1,
    tagName: tag,
    className,
    id,
    style: {},
    inert: false,
    parentElement: null,
  };
}

test('classify A/B/C/D and refuse a pass without a real gesture', () => {
  assert.equal(
    classifyAttempt({
      events: [{ type: 'pointerdown', target: 'div.loader-content', reachedCanvas: false }],
      cameraMoved: false,
      frameAdvanced: false,
    }).code,
    'A',
  );
  assert.equal(
    classifyAttempt({
      events: [{ type: 'pointerdown', target: 'canvas', reachedCanvas: true }],
      cameraMoved: false,
      frameAdvanced: false,
    }).code,
    'B',
  );
  assert.equal(
    classifyAttempt({
      events: [{ type: 'pointermove', target: 'canvas', reachedCanvas: true }],
      cameraMoved: true,
      frameAdvanced: false,
    }).code,
    'C',
  );
  assert.equal(
    classifyAttempt({
      events: [{ type: 'pointermove', target: 'canvas', reachedCanvas: true }],
      cameraMoved: true,
      frameAdvanced: true,
      renderFailure: 'link failed',
    }).code,
    'D',
  );
  assert.equal(
    classifyAttempt({
      events: [{ type: 'pointermove', target: 'canvas', reachedCanvas: true }],
      cameraMoved: true,
      frameAdvanced: true,
      contextLost: true,
    }).code,
    'D',
  );
  assert.equal(
    classifyAttempt({
      events: [{ type: 'pointerup', target: 'canvas', reachedCanvas: true }],
      cameraMoved: true,
      frameAdvanced: true,
    }).code,
    'pass',
  );
  const programmatic = classifyAttempt({
    events: [],
    cameraMoved: true,
    frameAdvanced: true,
  });
  assert.equal(programmatic.code, 'none');
  assert.notEqual(programmatic.code, 'pass');
});

test('a touch that hits loader-content is recorded as A and survives a new reader', () => {
  const storage = memoryStorage();
  const canvas = el('CANVAS', '', 'cesium');
  const loader = el('DIV', 'loader-content');
  const screen = el('DIV', '', 'loading-screen');
  loader.parentElement = screen;
  let frame = 10;
  const camera = { lon: 1, lat: 2, h: 1000, heading: 0, pitch: -1 };
  const monitor = createGlobeGestureMonitor({
    doc: { addEventListener() {}, removeEventListener() {}, defaultView: null },
    storage,
    getCanvas: () => canvas,
    readScene: () => ({ camera, frame, contextLost: false, loopStalled: false }),
    schedule: (fn) => fn(),
  });
  monitor.handleEvent({
    type: 'pointerdown',
    target: loader,
    pointerId: 1,
    pointerType: 'touch',
    cancelable: true,
    defaultPrevented: false,
  });
  monitor.handleEvent({
    type: 'pointerup',
    target: loader,
    pointerId: 1,
    pointerType: 'touch',
    cancelable: true,
    defaultPrevented: true,
  });
  const saved = monitor.snapshot().lastGesture;
  assert.equal(saved.code, 'A');
  assert.equal(saved.topTarget, 'div.loader-content');
  assert.equal(saved.reachedCanvas, false);
  assert.equal(saved.defaultPrevented, true);
  assert.match(saved.ancestors.map((row) => row.target).join(' '), /loader-content/);

  const reopened = createGestureTraceStore(storage);
  assert.equal(reopened.snapshot().lastGesture.code, 'A');
  assert.equal(reopened.snapshot().lastGesture.topTarget, 'div.loader-content');
  const text = renderDiagnosticText({
    buildId: 'git-test-1',
    metaBuildId: 'git-test-1',
    trace: reopened.snapshot(),
    inputs: {
      overlay: 'none',
      canvasPointerEvents: 'auto',
      enableInputs: true,
      enableRotate: true,
      enableZoom: true,
      enableTilt: true,
      webglLost: false,
      useDefaultRenderLoop: true,
      requestRenderMode: true,
    },
  });
  assert.match(text, /GESTURE A/);
  assert.match(text, /div\.loader-content/);
  assert.match(text, /BUILD MATCH/);
  assert.match(text, /FLAGS are not a verdict/);
  assert.doesNotMatch(text, /healthy/i);
  assert.equal(reopened.snapshot().lastGesture.code, 'A');
  assert.ok(storage.getItem(GESTURE_TRACE_KEY));
});

test('canvas gesture that moves the camera and the frame is a pass, not a flag verdict', () => {
  const storage = memoryStorage();
  const canvas = el('CANVAS');
  let scene = {
    camera: { lon: 0, lat: 0, h: 100, heading: 0, pitch: -0.5 },
    frame: 3,
    contextLost: false,
    loopStalled: false,
  };
  const monitor = createGlobeGestureMonitor({
    storage,
    getCanvas: () => canvas,
    readScene: () => scene,
    schedule: (fn) => fn(),
  });
  monitor.handleEvent({
    type: 'touchstart',
    target: canvas,
    touches: [{}, {}],
    cancelable: true,
    defaultPrevented: false,
  });
  scene = {
    camera: { lon: 0.01, lat: 0.02, h: 80, heading: 0.2, pitch: -0.4 },
    frame: 4,
    contextLost: false,
    loopStalled: false,
  };
  monitor.handleEvent({
    type: 'touchend',
    target: canvas,
    touches: [],
    cancelable: true,
    defaultPrevented: false,
  });
  const gesture = monitor.snapshot().lastGesture;
  assert.equal(gesture.code, 'pass');
  assert.equal(gesture.kind, 'pinch');
  assert.equal(gesture.cameraMoved, true);
  assert.equal(gesture.frameAdvanced, true);
});

test('camera change with no new frame is C; stalled loop is D', () => {
  assert.equal(
    cameraMoved(
      { lon: 0, lat: 0, h: 10, heading: 0, pitch: 0 },
      { lon: 0, lat: 0, h: 10.2, heading: 0, pitch: 0 },
    ),
    false,
  );
  assert.equal(
    cameraMoved(
      { lon: 0, lat: 0, h: 10, heading: 0, pitch: 0 },
      { lon: 0, lat: 0, h: 40, heading: 0, pitch: 0 },
    ),
    true,
  );
  const storage = memoryStorage();
  const canvas = el('CANVAS');
  const scene = {
    camera: { lon: 1, lat: 1, h: 500, heading: 0, pitch: -1 },
    frame: 8,
    contextLost: false,
    loopStalled: false,
  };
  const monitor = createGlobeGestureMonitor({
    storage,
    getCanvas: () => canvas,
    readScene: () => scene,
    schedule: (fn) => fn(),
  });
  monitor.handleEvent({
    type: 'pointerdown',
    target: canvas,
    pointerId: 4,
    pointerType: 'touch',
    defaultPrevented: false,
  });
  scene.camera = { ...scene.camera, lon: 1.2 };
  monitor.handleEvent({
    type: 'pointerup',
    target: canvas,
    pointerId: 4,
    pointerType: 'touch',
    defaultPrevented: false,
  });
  assert.equal(monitor.snapshot().lastGesture.code, 'C');

  scene.loopStalled = true;
  scene.frame = 9;
  monitor.handleEvent({
    type: 'pointerdown',
    target: canvas,
    pointerId: 5,
    pointerType: 'touch',
    defaultPrevented: false,
  });
  monitor.handleEvent({
    type: 'pointerup',
    target: canvas,
    pointerId: 5,
    pointerType: 'touch',
    defaultPrevented: false,
  });
  assert.equal(monitor.snapshot().lastGesture.code, 'D');
});

test('opening the diagnostic panel does not erase the stored gesture', () => {
  const storage = memoryStorage();
  const canvas = el('CANVAS');
  const blocker = el('DIV', 'loader-content');
  const monitor = createGlobeGestureMonitor({
    storage,
    getCanvas: () => canvas,
    readScene: () => ({
      camera: { lon: 0, lat: 0, h: 1, heading: 0, pitch: 0 },
      frame: 1,
      contextLost: false,
      loopStalled: false,
    }),
    schedule: (fn) => fn(),
  });
  monitor.handleEvent({
    type: 'pointerdown',
    target: blocker,
    pointerId: 1,
    pointerType: 'touch',
    defaultPrevented: false,
  });
  monitor.handleEvent({
    type: 'pointerup',
    target: blocker,
    pointerId: 1,
    pointerType: 'touch',
    defaultPrevented: false,
  });
  const before = storage.getItem(GESTURE_TRACE_KEY);
  const head = el('HEAD');
  const html = el('HTML');
  const body = el('PRE');
  body.dataset = {};
  const doc = {
    head,
    documentElement: html,
    createElement: () => el('META'),
    querySelector: (sel) => (sel === 'meta[name="ee-build"]' ? meta : null),
    defaultView: { innerWidth: 390, innerHeight: 844, getComputedStyle: () => ({}) },
    elementFromPoint: () => blocker,
    elementsFromPoint: () => [blocker, canvas],
  };
  const meta = {
    setAttribute(key, value) {
      this[key] = value;
    },
    getAttribute(key) {
      return this[key] || null;
    },
  };
  doc.createElement = () => meta;
  html.setAttribute = (key, value) => {
    html[key] = value;
  };
  const panel = {
    querySelector: () => body,
  };
  body.textContent = '';
  publishBuildStamp(doc, 'git-panel-9');
  assert.equal(readMetaBuildId(doc), 'git-panel-9');
  const text = fillDiagnosticPanel(panel, monitor, doc, 'git-panel-9');
  assert.match(text, /BUILD git-panel-9/);
  assert.match(text, /META\s+git-panel-9/);
  assert.match(text, /GESTURE A/);
  assert.doesNotMatch(text, /healthy/i);
  assert.equal(storage.getItem(GESTURE_TRACE_KEY), before);
  assert.equal(monitor.snapshot().lastGesture.code, 'A');
  assert.equal(targetLabel(blocker), 'div.loader-content');
  assert.ok(ancestorStyleChain(blocker).length >= 1);
});
