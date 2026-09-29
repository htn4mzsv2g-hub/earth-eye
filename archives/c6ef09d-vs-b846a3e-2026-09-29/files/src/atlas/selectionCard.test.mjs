import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Minimal window for card event subscriptions in Node.
if (!globalThis.window) {
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };
}
if (!globalThis.document) {
  globalThis.document = {
    documentElement: { classList: { contains: () => false } },
    createElement(tag) {
      const el = {
        tagName: String(tag).toUpperCase(),
        hidden: false,
        dataset: {},
        style: {},
        innerHTML: '',
        children: [],
        setAttribute(k, v) {
          this[k] = v;
        },
        getAttribute(k) {
          return this[k];
        },
        appendChild(c) {
          this.children.push(c);
          return c;
        },
        addEventListener() {},
        remove() {},
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return [];
        },
        closest() {
          return null;
        },
      };
      return el;
    },
  };
}

import { initSelectionCard } from './selectionCard.js';


test('selection card mounts hidden and shows FOLLOW/COCKPIT for air subject', () => {
  const root = { appendChild(node) { this.node = node; } };
  const actions = [];
  const ac = new AbortController();
  const cardApi = initSelectionCard({
    root,
    runAction: async (name, args) => {
      actions.push({ name, args });
      return { ok: true };
    },
    say: () => {},
    getFlightsTracked: () => null,
    getCockpitState: () => ({
      active: false,
      entryAllowed: false,
      entryBlockedReason: 'no-tracked-aircraft',
    }),
    signal: ac.signal,
  });
  const card = root.node;
  assert.equal(card.hidden, true);
  cardApi.setSubject({
    layerId: 'flights',
    id: 'abc123',
    label: 'TEST123',
    following: false,
    stale: false,
  });
  assert.equal(card.hidden, false);
  assert.match(card.innerHTML, /FOLLOW/);
  assert.match(card.innerHTML, /COCKPIT/);
  assert.match(card.innerHTML, /SELECT/);
  cardApi.setSubject({
    layerId: 'flights',
    id: 'abc123',
    label: 'TEST123',
    following: true,
    stale: true,
  });
  assert.match(card.innerHTML, /STALE/);
  assert.match(card.innerHTML, /STOP FOLLOW/);
  assert.match(card.innerHTML, /FOLLOW an aircraft first|disabled/);
  ac.abort();
});

test('flights tracking emits stale awareness event name', () => {
  const src = readFileSync(new URL('../layers/flights/tracking.js', import.meta.url), 'utf8');
  assert.match(src, /gev:awareness-subject-stale/);
  assert.match(src, /flightState\._selectedIcao = icao24/);
});

test('traffic controls expose TomTom legend when live', async () => {
  const src = readFileSync(
    new URL('../layers/traffic/controls.js', import.meta.url),
    'utf8',
  );
  assert.match(src, /getRowControls\(\)/);
  assert.match(src, /TomTom flow/);
  assert.match(src, /NEEDS KEY/);
});
