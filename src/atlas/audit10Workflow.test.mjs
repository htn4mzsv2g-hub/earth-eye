/**
 * Journey-focused tests for ChatGPT non-3D desktop audit (10 workflow fixes).
 * Prefer journeys over helpers-only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectPlace,
  selectCamera,
  readSharedIdentity,
  readSharedLocation,
  onCameraViewerClosed,
  clearSharedSelection,
  DEFAULT_VIEWER_CLOSE_POLICY,
  VIEWER_CLOSE_POLICY,
} from './sharedSelection.js';
import {
  parseAnalystInput,
  createAnalystTools,
  ANALYST_EXAMPLES,
} from './analystTools.js';
import { createExplorePanel } from './analystPanel.js';
import { createTrackWorkspace } from './trackWorkspace.js';
import { createWorldEventsPanel } from '../events/live/panel.js';
import { MAP_ACTION_TOOLS } from '../app/graphicsRecovery.js';
import {
  mountGraphicsRecoveryPanel,
  createGraphicsFailedState,
} from '../app/graphicsRecovery.js';
import { getContextStore } from '../data/contextStore.js';

// contextStore hangs on window — provide a minimal host for Node tests.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    dispatchEvent() {
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
  };
}

// Minimal DOM for panel / banner tests
function makeDoc() {
  const listeners = new Map();
  const body = {
    children: [],
    appendChild(c) {
      this.children.push(c);
      c.parent = this;
      return c;
    },
    classList: { add() {}, remove() {}, contains() { return false; } },
  };
  const doc = {
    body,
    documentElement: {
      classList: { add() {}, remove() {}, contains() { return false; } },
    },
    getElementById(id) {
      const walk = (n) => {
        if (n.id === id) return n;
        for (const c of n.children || []) {
          const h = walk(c);
          if (h) return h;
        }
        return null;
      };
      return walk(body);
    },
    createElement(tag) {
      const attrs = new Map();
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        textContent: '',
        hidden: false,
        disabled: false,
        children: [],
        dataset: {},
        style: {},
        parent: null,
        classList: {
          _s: new Set(),
          add(...xs) {
            for (const x of xs) {
              this._s.add(x);
              el.className = [...this._s].join(' ');
            }
          },
          remove(...xs) {
            for (const x of xs) this._s.delete(x);
            el.className = [...this._s].join(' ');
          },
          contains(x) {
            if (this._s.has(x)) return true;
            return String(el.className || '')
              .split(/\s+/)
              .includes(x);
          },
        },
        setAttribute(k, v) {
          attrs.set(k, String(v));
          if (k === 'id') el.id = String(v);
        },
        getAttribute(k) {
          return attrs.has(k) ? attrs.get(k) : null;
        },
        append(...xs) {
          for (const x of xs) el.appendChild(x);
        },
        appendChild(c) {
          c.parent = el;
          el.children.push(c);
          return c;
        },
        remove() {
          if (!el.parent) return;
          const i = el.parent.children.indexOf(el);
          if (i >= 0) el.parent.children.splice(i, 1);
          el.parent = null;
        },
        addEventListener(type, fn) {
          (el._l ||= {})[type] ||= [];
          el._l[type].push(fn);
        },
        click() {
          for (const fn of el._l?.click || []) fn();
        },
        querySelector(sel) {
          const walk = (n) => {
            for (const c of n.children || []) {
              if (sel.startsWith('.') && c.classList.contains(sel.slice(1)))
                return c;
              if (sel.startsWith('#') && c.id === sel.slice(1)) return c;
              const h = walk(c);
              if (h) return h;
            }
            return null;
          };
          return walk(el);
        },
      };
      return el;
    },
  };
  return doc;
}

function resetSelection() {
  const store = getContextStore();
  store.entities.clear();
  store.selectedEntityId = null;
  store.selectedAt = null;
}

test('1 shared selection: place + camera share one identity (Cesium-independent)', () => {
  resetSelection();
  const place = selectPlace({
    label: 'Austin',
    lat: 30.2672,
    lon: -97.7431,
  });
  assert.ok(place);
  const id = readSharedIdentity();
  assert.equal(id.type, 'place');
  assert.match(id.label, /Austin/);
  const loc = readSharedLocation();
  assert.equal(loc.lat, 30.2672);
  assert.equal(loc.lon, -97.7431);

  selectCamera({ id: 'txdot:cam-1', label: 'I-35', lat: 30.26, lon: -97.74 });
  const cam = readSharedIdentity();
  assert.equal(cam.type, 'cctv');
  assert.equal(cam.providerId, 'txdot:cam-1');
});

test('1 viewer close RETAIN policy keeps camera selection', () => {
  resetSelection();
  selectCamera({ id: 'cam-retain', label: 'Keep me' });
  assert.equal(onCameraViewerClosed(DEFAULT_VIEWER_CLOSE_POLICY), 'retain');
  assert.equal(readSharedIdentity()?.providerId, 'cam-retain');
  onCameraViewerClosed(VIEWER_CLOSE_POLICY.CLEAR);
  assert.equal(readSharedIdentity(), null);
});

test('1/2 what is this + open camera SUCCESS without 3D', async () => {
  resetSelection();
  selectPlace({ label: 'Denver', lat: 39.7392, lon: -104.9903 });
  const parsed = parseAnalystInput('what is this');
  assert.ok(!parsed.error, parsed.error);
  assert.equal(parsed.plan[0].tool, 'selected_entity');
  assert.ok(ANALYST_EXAMPLES.includes('what is this'));

  let opened = false;
  const tools = createAnalystTools({
    graphicsFailed: true,
    openCamera: (id) => {
      opened = true;
      return { ok: true, status: 'SUCCESS', known: true, id };
    },
    selectCamera: (m) => selectCamera(m),
    getSelectedIdentity: () => readSharedIdentity(),
    sources: { getSourceStatus: () => ({}) },
    runAction: async () => ({ ok: true }),
  });
  const sel = await tools.run('selected_entity', {});
  assert.equal(sel.status, 'SUCCESS');
  assert.equal(sel.items[0].label, 'Denver');

  const cam = await tools.run('select_entity', {
    layerId: 'cctv',
    id: 'cam-9',
  });
  assert.equal(opened, true);
  assert.equal(cam.status, 'SUCCESS');
  assert.match(cam.note || '', /shared CAMERAS viewer/i);
  // Must NOT be blocked as map action when renderer down
  assert.ok(!MAP_ACTION_TOOLS.includes('select_entity'));
  assert.ok(!MAP_ACTION_TOOLS.includes('set_layer'));
});

test('3 Place Select location independent of Fly (explore journey)', () => {
  resetSelection();
  const host = { innerHTML: '', isConnected: true, querySelector: () => ({}) };
  // Minimal querySelector for rerender guard
  host.querySelector = (sel) => (sel.includes('explore') ? host : null);
  let selected = null;
  const tools = {
    run: async (tool) => {
      if (tool === 'resolve_place')
        return {
          ok: true,
          items: [
            { label: 'Austin, TX', lat: 30.2672, lon: -97.7431, kind: 'city' },
          ],
          citations: [{ provider: 'Nominatim', url: null }],
        };
      if (tool === 'fly_to')
        return { ok: false, status: 'UNAVAILABLE', error: 'no 3D' };
      return { ok: false, error: 'unexpected ' + tool };
    },
  };
  const panel = createExplorePanel({
    tools,
    graphicsFailed: true,
    selectPlace: (m) => {
      selected = selectPlace(m);
      return selected;
    },
  });
  panel.render(host);
  assert.match(host.innerHTML, /Select location/);
  assert.match(host.innerHTML, /UNAVAILABLE without 3D/);
  // Simulate Find + Select
  return panel.find('Austin').then(() => {
    assert.match(host.innerHTML, /data-ex-select/);
    assert.match(host.innerHTML, /Fly · UNAVAILABLE/);
    panel.onClick({
      target: {
        closest: (sel) =>
          sel === '[data-ex-select]'
            ? { dataset: { exSelect: '0' } }
            : null,
      },
    });
    assert.ok(selected);
    assert.equal(readSharedLocation()?.lat, 30.2672);
    assert.match(host.innerHTML, /SELECTED location/);
  });
});

test('4 TRACK Show is not a silent no-op in non-3D', async () => {
  const layers = new Map([['flights', false]]);
  const host = {
    innerHTML: '',
    isConnected: true,
    querySelector: () => host,
    querySelectorAll: () => [],
  };
  const ws = createTrackWorkspace({
    getStatus: () => ({ status: 'IDLE', count: 0 }),
    isLayerOn: (id) => Boolean(layers.get(id)),
    setLayer: async (id, on) => {
      layers.set(id, on);
      return { ok: true };
    },
    graphicsFailed: true,
  });
  ws.render(host);
  assert.match(host.innerHTML, /NON-3D/);
  assert.match(host.innerHTML, /Show/);
  await ws.onClick({
    target: {
      closest: (sel) =>
        sel === '[data-track-layer]'
          ? {
              getAttribute: (a) =>
                a === 'data-track-layer' ? 'flights' : a === 'data-on' ? '1' : null,
            }
          : sel === '[data-track-focus]'
            ? null
            : null,
    },
  });
  assert.equal(layers.get('flights'), true);
  assert.match(host.innerHTML, /list\/details/i);
});

test('7 recovery banner compact + dismissible + no duplicate Retry', () => {
  const doc = makeDoc();
  const state = createGraphicsFailedState(new Error('WebGL init failed'));
  let retries = 0;
  const a = mountGraphicsRecoveryPanel({
    state,
    doc,
    onRetry: () => {
      retries += 1;
    },
    onContinue: () => {},
  });
  assert.ok(
    a.root.classList.contains('ee-graphics-recovery--compact') ||
      String(a.root.className).includes('ee-graphics-recovery--compact'),
  );
  // Second mount replaces — no stacked banners
  const b = mountGraphicsRecoveryPanel({
    state,
    doc,
    onRetry: () => {
      retries += 1;
    },
    onContinue: () => {},
  });
  assert.equal(doc.body.children.filter((c) => c.id === 'ee-graphics-recovery').length, 1);
  const retry = b.root.querySelector('.ee-graphics-recovery-retry');
  assert.ok(retry);
  retry.click();
  retry.click(); // second click ignored while disarmed
  assert.equal(retries, 1);
  const dismiss = b.root.querySelector('.ee-graphics-recovery-dismiss');
  assert.ok(dismiss);
  dismiss.click();
  assert.equal(b.root.hidden, true);
});

test('6 non-3D events panel says Map unavailable not GLOBE MARKERS ON', () => {
  const host = {
    innerHTML: '',
    isConnected: true,
    querySelector: () => host,
  };
  const panel = createWorldEventsPanel({
    getState: () => ({
      filteredEvents: [
        { eventId: 'usgs:1', title: 'M4.2', kind: 'PUBLIC DATA OBSERVATION', precision: 'point' },
      ],
      markersOn: true,
      markerCohort: [{ eventId: 'usgs:1' }],
      rendererDown: true,
      sources: [],
      filters: { kinds: [], tiers: [], sources: [] },
      phase: 'ready',
      health: 'READY',
      error: null,
      eventCount: 1,
      selectedEvent: null,
      relatedConditions: null,
    }),
    rendererDown: true,
    onRefresh() {},
    onToggleMarkers() {},
    onClearSelection() {},
    onToggleKind() {},
    onToggleTier() {},
    onToggleSource() {},
    onSelect() {},
  });
  panel.render(host);
  assert.match(host.innerHTML, /Map unavailable/i);
  assert.doesNotMatch(host.innerHTML, /GLOBE MARKERS ON/);
  assert.match(host.innerHTML, /have map locations/i);
});

test('9 health scopes present on source_health items', async () => {
  const tools = createAnalystTools({
    graphicsFailed: true,
    sources: {
      getSourceStatus: (id) => ({
        name: id === 'earthquakes' ? 'Earthquakes' : id,
        status: 'READY',
        enabled: false,
        health: 'READY',
        healthLabel: 'READY',
        provider: 'USGS',
      }),
    },
    runAction: async () => ({ ok: true }),
    fetchCollectionHealth: async () => null,
  });
  const r = await tools.run('source_health', { layerId: 'earthquakes' });
  assert.equal(r.status, 'SUCCESS');
  assert.ok(r.items[0].scopes);
  assert.equal(r.items[0].scopes.layer, 'OFF');
  assert.match(r.items[0].scopes.rendered, /UNAVAILABLE/);
  assert.match(r.items[0].detail, /provider/);
});

test('10 event detail expandable ID + RELATED ≠ causation copy', () => {
  const host = {
    innerHTML: '',
    isConnected: true,
    querySelector: () => host,
  };
  const event = {
    eventId: 'usgs:us7000xyz',
    title: 'M4.2 - 10 km N of Austin',
    kind: 'PUBLIC DATA OBSERVATION',
    precision: 'point',
    sources: ['USGS'],
    attribution: {
      credit: 'USGS',
      sourceLinks: ['https://earthquake.usgs.gov/'],
    },
    eventTime: { start: '2026-09-29T12:00:00Z' },
    retrievedAt: '2026-09-29T12:05:00Z',
    geometry: { type: 'Point', lon: -97.74, lat: 30.27 },
  };
  const panel = createWorldEventsPanel({
    getState: () => ({
      filteredEvents: [event],
      markersOn: false,
      markerCohort: [],
      rendererDown: true,
      sources: [],
      filters: { kinds: [], tiers: [], sources: [] },
      phase: 'ready',
      health: 'READY',
      error: null,
      eventCount: 1,
      selectedEvent: event,
      relatedConditions: {
        note: 'RELATED — not causal proof.',
        cameras: [],
        weather: [],
        alerts: [],
        aircraft: [],
        fires: [],
      },
    }),
    rendererDown: true,
    onRefresh() {},
    onToggleMarkers() {},
    onClearSelection() {},
    onToggleKind() {},
    onToggleTier() {},
    onToggleSource() {},
    onSelect() {},
  });
  panel.render(host);
  assert.match(host.innerHTML, /ee-we-id-expand/);
  assert.match(host.innerHTML, /M4\.2/);
  assert.match(host.innerHTML, /Source links|earthquake\.usgs\.gov/);
  assert.match(host.innerHTML, /RELATED/);
  assert.match(host.innerHTML, /RELATED ≠ CAUSED BY|Never labeled CAUSED BY/);
  assert.doesNotMatch(host.innerHTML, /caused this event|CAUSED BY this/i);
});
