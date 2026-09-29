import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRAPHICS_INIT_CODE,
  NON3D_QUERY_PARAM,
  NON3D_STORAGE_KEY,
  GraphicsInitError,
  isGraphicsInitFailure,
  wrapGraphicsInitFailure,
  createGraphicsFailedState,
  shouldForceNon3dMode,
  setForceNon3dFlag,
  mountGraphicsRecoveryPanel,
  dismissLoadingScreen,
  clearCesiumErrorOverlay,
  labelMapDependentUnavailable,
  createDegradedDataManager,
  createDegradedStyleManager,
  createGraphicsFailedScene,
  degradedRunAction,
  isMapDependentAction,
  describeGraphicsError,
  MAP_ACTION_TOOLS,
} from './graphicsRecovery.js';

/** Minimal DOM node for recovery UI tests (no jsdom dependency). */
function node(tag = 'div') {
  const attrs = new Map();
  const n = {
    tagName: String(tag).toUpperCase(),
    children: [],
    classList: {
      _set: new Set(),
      add(...xs) {
        for (const x of xs) this._set.add(x);
      },
      remove(...xs) {
        for (const x of xs) this._set.delete(x);
      },
      contains(x) {
        return this._set.has(x);
      },
    },
    dataset: {},
    style: {},
    textContent: '',
    hidden: false,
    disabled: false,
    parent: null,
    ownerDocument: null,
    setAttribute(k, v) {
      attrs.set(k, String(v));
    },
    getAttribute(k) {
      return attrs.has(k) ? attrs.get(k) : null;
    },
    appendChild(c) {
      c.parent = this;
      c.ownerDocument = this.ownerDocument;
      this.children.push(c);
      return c;
    },
    append(...xs) {
      for (const c of xs) this.appendChild(c);
    },
    remove() {
      if (!this.parent) return;
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    },
    querySelector(sel) {
      const walk = (el) => {
        for (const c of el.children || []) {
          if (match(c, sel)) return c;
          const hit = walk(c);
          if (hit) return hit;
        }
        return null;
      };
      return walk(this);
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (el) => {
        for (const c of el.children || []) {
          if (match(c, sel)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    },
    addEventListener(type, fn) {
      this._listeners = this._listeners || {};
      (this._listeners[type] ||= []).push(fn);
    },
    click() {
      for (const fn of this._listeners?.click || []) fn();
    },
  };
  return n;
}

function match(el, sel) {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.'))
    return el.classList.contains(sel.slice(1)) || el.className === sel.slice(1);
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const body = sel.slice(1, -1);
    const [rawKey, rawVal] = body.split('=');
    const key = rawKey.trim();
    if (key.startsWith('data-')) {
      const ds = key
        .slice(5)
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const have = el.dataset?.[ds];
      if (rawVal == null) return have != null || el.getAttribute(key) != null;
      const want = rawVal.replace(/^["']|["']$/g, '');
      return String(have ?? el.getAttribute(key) ?? '') === want;
    }
    return el.getAttribute(key) != null;
  }
  return false;
}

function fakeDoc() {
  const body = node('body');
  const html = node('html');
  const byId = new Map();
  const doc = {
    body,
    documentElement: html,
    createElement: (tag) => {
      const el = node(tag);
      el.ownerDocument = doc;
      el.className = '';
      Object.defineProperty(el, 'className', {
        get() {
          return [...this.classList._set].join(' ');
        },
        set(v) {
          this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
        },
        configurable: true,
      });
      return el;
    },
    getElementById: (id) => byId.get(id) || null,
    _register(el) {
      if (el.id) byId.set(el.id, el);
    },
  };
  body.ownerDocument = doc;
  html.ownerDocument = doc;
  const origAppend = body.appendChild.bind(body);
  body.appendChild = (c) => {
    const r = origAppend(c);
    if (c.id) byId.set(c.id, c);
    const origRemove = c.remove.bind(c);
    c.remove = () => {
      if (c.id) byId.delete(c.id);
      origRemove();
    };
    return r;
  };
  return { doc, body, byId };
}

test('isGraphicsInitFailure detects Cesium WebGL init failure', () => {
  assert.equal(
    isGraphicsInitFailure(
      new Error('The browser supports WebGL, but initialization failed.'),
    ),
    true,
  );
  assert.equal(
    isGraphicsInitFailure(new Error('Failed to create WebGL context')),
    true,
  );
  assert.equal(isGraphicsInitFailure(new Error('network timeout')), false);
  assert.equal(isGraphicsInitFailure(null), false);
});

test('GraphicsInitError wrap is idempotent', () => {
  const cause = new Error(
    'The browser supports WebGL, but initialization failed.',
  );
  const wrapped = wrapGraphicsInitFailure(cause);
  assert.ok(wrapped instanceof GraphicsInitError);
  assert.equal(wrapped.code, GRAPHICS_INIT_CODE);
  assert.equal(wrapGraphicsInitFailure(wrapped), wrapped);
});

test('createGraphicsFailedState is honest and frozen', () => {
  const state = createGraphicsFailedState(
    new Error('The browser supports WebGL, but initialization failed.'),
  );
  assert.equal(state.failed, true);
  assert.equal(state.code, GRAPHICS_INIT_CODE);
  assert.match(state.headline, /3D view is unavailable/i);
  assert.match(state.detail, /explore available data/i);
  assert.throws(() => {
    state.failed = false;
  });
});

test('shouldForceNon3dMode reads query and session flag (no auth bypass)', () => {
  assert.equal(shouldForceNon3dMode('?ee_non3d=1', null), true);
  assert.equal(shouldForceNon3dMode('?ee_non3d=true', null), true);
  assert.equal(shouldForceNon3dMode('?ee_non3d=0', null), false);
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  setForceNon3dFlag(true, storage);
  assert.equal(storage.getItem(NON3D_STORAGE_KEY), '1');
  assert.equal(shouldForceNon3dMode('?', storage), true);
  setForceNon3dFlag(false, storage);
  assert.equal(shouldForceNon3dMode('?', storage), false);
  assert.equal(NON3D_QUERY_PARAM, 'ee_non3d');
});

test('rejected/forced graphics → recovery UI with Retry 3D and Continue without 3D', () => {
  const { doc, body, byId } = fakeDoc();
  const loading = doc.createElement('div');
  loading.id = 'loading-screen';
  loading.classList.add('x');
  const status = doc.createElement('p');
  status.className = 'loader-status';
  loading.appendChild(status);
  byId.set('loading-screen', loading);
  body.appendChild(loading);

  const cesium = doc.createElement('div');
  cesium.id = 'cesiumContainer';
  const errPanel = doc.createElement('div');
  errPanel.className = 'cesium-widget-errorPanel';
  cesium.appendChild(errPanel);
  byId.set('cesiumContainer', cesium);
  body.appendChild(cesium);

  const shell = doc.createElement('div');
  shell.id = 'shell';
  const tour = doc.createElement('button');
  tour.dataset.atlasAction = 'tour';
  tour.setAttribute = (k, v) => {
    tour._attrs = tour._attrs || {};
    tour._attrs[k] = v;
  };
  tour.getAttribute = (k) => tour._attrs?.[k] ?? null;
  // labelMapDependentUnavailable uses attribute selectors — set dataset keys
  Object.assign(tour.dataset, { atlasAction: 'tour' });
  // Our match() looks at data-atlas-action attribute form via dataset camelCase
  // Use data attributes the helper expects:
  const follow = doc.createElement('button');
  follow.dataset.eeSel = 'follow';
  shell.append(tour, follow);
  // Fix: labelMapDependentUnavailable uses CSS selectors; our fake match needs
  // getAttribute for data-atlas-action. Patch nodes:
  tour.getAttribute = (k) =>
    k === 'data-atlas-action' ? 'tour' : tour._title || null;
  tour.setAttribute = (k, v) => {
    if (k === 'title') tour._title = v;
  };
  follow.getAttribute = (k) =>
    k === 'data-ee-sel' ? 'follow' : follow._title || null;
  follow.setAttribute = (k, v) => {
    if (k === 'title') follow._title = v;
  };
  // Override querySelectorAll on shell to return map-dependent buttons
  shell.querySelectorAll = (sel) => {
    if (String(sel).includes('tour') || String(sel).includes('follow'))
      return [tour, follow];
    return [];
  };

  dismissLoadingScreen(loading);
  assert.ok(loading.classList.contains('hidden'));

  clearCesiumErrorOverlay(doc);
  assert.ok(cesium.querySelector('[data-ee-globe-placeholder]'));

  let retried = 0;
  let continued = 0;
  const state = createGraphicsFailedState(
    new Error('The browser supports WebGL, but initialization failed.'),
  );
  const panel = mountGraphicsRecoveryPanel({
    state,
    onRetry: () => {
      retried += 1;
    },
    onContinue: () => {
      continued += 1;
    },
    parent: body,
    doc,
  });
  assert.ok(doc.getElementById('ee-graphics-recovery'));
  // Fake DOM does not roll up textContent; gather from children.
  const text = panel.root.children.map((c) => c.textContent).join(' ');
  assert.match(text, /3D VIEW UNAVAILABLE/);
  assert.match(text, /still explore available data|explore available data/i);

  const retryBtn = panel.root.querySelector('[data-ee-graphics-retry]');
  const contBtn = panel.root.querySelector('[data-ee-graphics-continue]');
  assert.ok(retryBtn);
  assert.ok(contBtn);
  assert.equal(retryBtn.textContent, 'Retry 3D');
  assert.equal(contBtn.textContent, 'Continue');
  retryBtn.click();
  assert.equal(retried, 1);
  contBtn.click();
  assert.equal(continued, 1);
  assert.equal(panel.root.dataset.eeCollapsed, '1');

  labelMapDependentUnavailable(shell);
  assert.equal(tour.disabled, true);
  assert.equal(follow.disabled, true);
  assert.match(tour.getAttribute('title') || '', /UNAVAILABLE/);

  assert.ok(doc.documentElement.classList.contains('ee-graphics-failed'));
  panel.destroy();
  assert.equal(panel.root.parent, null);
  assert.equal(doc.getElementById('ee-graphics-recovery'), null);
});

test('degraded stubs refuse map actions as UNAVAILABLE — no fake SUCCESS', async () => {
  const dm = createDegradedDataManager();
  assert.deepEqual(dm.getAll(), []);
  assert.equal(dm.get('flights'), null);
  await assert.rejects(() => dm.setEnabled('flights', true), /UNAVAILABLE/);

  const sm = createDegradedStyleManager();
  assert.equal(sm.getCockpitState(), null);

  for (const tool of MAP_ACTION_TOOLS) {
    assert.equal(isMapDependentAction(tool), true);
    const r = await degradedRunAction(tool, {});
    assert.equal(r.ok, false);
    assert.equal(r.status, 'UNAVAILABLE');
    assert.match(r.error, /UNAVAILABLE/);
    assert.doesNotMatch(r.error || '', /SUCCESS/i);
  }

  const scene = createGraphicsFailedScene({
    error: new Error('The browser supports WebGL, but initialization failed.'),
    operations: { requests: {} },
  });
  assert.equal(scene.viewer, null);
  assert.equal(scene.graphicsFailed, true);
  assert.equal(scene.mapStackController, null);
});

test('describeGraphicsError handles non-Error throws', () => {
  assert.equal(describeGraphicsError('boom'), 'boom');
  assert.equal(describeGraphicsError({ message: 'x' }), 'x');
  assert.match(describeGraphicsError(null), /Unknown/);
});
