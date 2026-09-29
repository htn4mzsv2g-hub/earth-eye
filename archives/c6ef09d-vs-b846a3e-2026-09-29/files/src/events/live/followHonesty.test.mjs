/**
 * EE-EVENTS FOLLOW honesty journeys (LIVE_WORLD EE-EVENTS-4).
 * SELECT ≠ FOLLOW; Follow UNAVAILABLE; no fake notify / 24/7 claims.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  EVENT_FOLLOW_CONTROL_LABEL,
  EVENT_FOLLOW_SELECT_NOTE,
  EVENT_FOLLOW_UNAVAILABLE_REASON,
  eventFollowAvailability,
  eventFollowSourceState,
  hasForbiddenEventFollowClaim,
} from './followAvailability.js';
import { createWorldEventsPanel } from './panel.js';
import { buildEventDetail } from './detail.js';

const here = dirname(fileURLToPath(import.meta.url));

function officialPoint() {
  return {
    eventId: 'usgs:t1',
    title: 'M 3.2 — Test Quake',
    kind: 'OFFICIAL ALERT',
    category: 'earthquake',
    sources: ['usgs'],
    attribution: {
      credit: 'USGS',
      license: 'public domain',
      sourceLinks: ['https://earthquake.usgs.gov/'],
    },
    eventTime: { start: '2026-09-29T12:00:00Z', end: null },
    retrievedAt: '2026-09-29T12:05:00Z',
    publishedAt: '2026-09-29T12:01:00Z',
    precision: 'point',
    geometry: { type: 'Point', coordinates: [-97.74, 30.27] },
    severity: null,
    revisionState: 'active',
    status: 'active',
  };
}

test('FOLLOW honesty: World Event Follow is always UNAVAILABLE', () => {
  const a = eventFollowAvailability({ eventId: 'usgs:t1', selected: true });
  assert.equal(a.available, false);
  assert.equal(a.status, 'UNAVAILABLE');
  assert.equal(a.following, false);
  assert.equal(a.selectIsNotFollow, true);
  assert.equal(a.claims.notifications, false);
  assert.equal(a.claims.continuousWatch, false);
  assert.equal(a.claims.durableRetention, false);
  assert.match(a.reason, /UNAVAILABLE/);
  assert.match(a.reason, /retention|notify/i);
  assert.match(a.reason, /not Following/i);
  assert.equal(hasForbiddenEventFollowClaim(a.reason), false);
  assert.equal(hasForbiddenEventFollowClaim(EVENT_FOLLOW_SELECT_NOTE), false);
  assert.equal(hasForbiddenEventFollowClaim(EVENT_FOLLOW_UNAVAILABLE_REASON), false);
});

test('FOLLOW honesty: Select ≠ Follow copy is explicit', () => {
  assert.match(EVENT_FOLLOW_SELECT_NOTE, /SELECT ≠ FOLLOW|SELECT != FOLLOW/i);
  assert.match(EVENT_FOLLOW_CONTROL_LABEL, /UNAVAILABLE/);
  assert.doesNotMatch(EVENT_FOLLOW_SELECT_NOTE, /you'?ll be notif/i);
  assert.doesNotMatch(EVENT_FOLLOW_UNAVAILABLE_REASON, /you'?ll be notif/i);
  assert.match(EVENT_FOLLOW_UNAVAILABLE_REASON, /no alert delivery/i);
  assert.match(EVENT_FOLLOW_SELECT_NOTE, /no continuous watch claim/i);
});

test('FOLLOW honesty: stale/lost handling not active while Follow unavailable', () => {
  const state = eventFollowSourceState({ stale: true, lost: true });
  assert.equal(state.applicable, false);
  assert.equal(state.status, 'UNAVAILABLE');
  assert.match(state.reason, /Follow itself is UNAVAILABLE/i);
  assert.equal(state.stale, false);
  assert.equal(state.lost, false);
});

test('FOLLOW honesty: forbidden claim detector catches notify / 24/7 copy', () => {
  assert.equal(hasForbiddenEventFollowClaim("You'll be notified when this updates"), true);
  assert.equal(hasForbiddenEventFollowClaim('We will notify you of changes'), true);
  assert.equal(hasForbiddenEventFollowClaim('Get push notifications for this event'), true);
  assert.equal(hasForbiddenEventFollowClaim('alerts when this event updates'), true);
  assert.equal(hasForbiddenEventFollowClaim('watching this event around the clock'), true);
  assert.equal(
    hasForbiddenEventFollowClaim(
      'SELECT ≠ FOLLOW. Follow UNAVAILABLE — no alert delivery, no continuous watch claim.',
    ),
    false,
  );
});

test('FOLLOW honesty: panel shows FOLLOW · UNAVAILABLE and no fake notify claims', () => {
  const ev = officialPoint();
  const target = {
    _html: '',
    isConnected: true,
    querySelector() {
      return {};
    },
    set innerHTML(v) {
      this._html = String(v);
    },
    get innerHTML() {
      return this._html;
    },
  };
  const panel = createWorldEventsPanel({
    getState: () => ({
      phase: 'ready',
      health: 'OK',
      eventCount: 1,
      filteredEvents: [ev],
      markerCohort: [],
      sources: [],
      filters: { kinds: [], tiers: [], sources: [] },
      selectedEvent: ev,
      relatedConditions: null,
      rendererDown: false,
      markersOn: false,
      error: null,
    }),
    onToggleKind() {},
    onToggleTier() {},
    onToggleSource() {},
    onSelect() {},
    onRefresh() {},
    onToggleMarkers() {},
    onClearSelection() {},
    rendererDown: false,
  });
  panel.render(target, { textContent: '' });
  const html = target.innerHTML;
  assert.match(html, /data-ee-we-detail/);
  assert.match(html, /FOLLOW · UNAVAILABLE/);
  assert.match(html, /data-ee-follow="unavailable"/);
  assert.match(html, /SELECT ≠ FOLLOW|SELECT != FOLLOW/i);
  assert.match(html, /data-ee-we-follow-unavail/);
  assert.match(html, /retention|notify/i);
  assert.equal(hasForbiddenEventFollowClaim(html), false);
  assert.doesNotMatch(html, /you'?ll be notif/i);
  assert.doesNotMatch(html, /push notificat/i);
  // Disabled follow control must not look enabled.
  assert.match(html, /data-ee-follow="unavailable"[^>]*disabled/);
});

test('FOLLOW honesty: selecting an event does not imply following in detail model', () => {
  const detail = buildEventDetail(officialPoint());
  assert.ok(detail);
  assert.equal(detail.eventId, 'usgs:t1');
  // Detail model has no following flag — select is provenance only.
  assert.equal('following' in detail, false);
  const follow = eventFollowAvailability({
    eventId: detail.eventId,
    selected: true,
  });
  assert.equal(follow.following, false);
  assert.equal(follow.available, false);
});

test('FOLLOW honesty: selection card world-event keeps SELECT and disabled Follow', async () => {
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
  } else if (!globalThis.document.documentElement) {
    globalThis.document.documentElement = {
      classList: { contains: () => false },
    };
  }

  const { initSelectionCard } = await import('../../atlas/selectionCard.js');
  const root = {
    appendChild(node) {
      this.node = node;
    },
  };
  const ac = new AbortController();
  const cardApi = initSelectionCard({
    root,
    runAction: async () => ({ ok: true }),
    say: () => {},
    getFlightsTracked: () => null,
    getCockpitState: () => ({ active: false }),
    signal: ac.signal,
  });
  const card = root.node;
  // Mistaken following:true must still render as SELECT for world events.
  cardApi.setSubject({
    layerId: 'world-events',
    id: 'usgs:t1',
    label: 'M 3.2 — Test Quake',
    following: true,
    stale: true,
    lat: 30.27,
    lon: -97.74,
  });
  assert.equal(card.hidden, false);
  assert.equal(card.dataset.following, 'false');
  assert.equal(card.dataset.stale, 'false');
  assert.match(card.innerHTML, /SELECT/);
  assert.doesNotMatch(card.innerHTML, /data-tone="live">FOLLOW/);
  assert.match(card.innerHTML, /FOLLOW · UNAVAILABLE|FOLLOW/);
  assert.match(card.innerHTML, /data-ee-follow="unavailable"/);
  assert.match(card.innerHTML, /SELECT ≠ FOLLOW|Follow stays unavailable|not Following/i);
  assert.equal(hasForbiddenEventFollowClaim(card.innerHTML), false);
  ac.abort();
});

test('FOLLOW honesty: UI source and exported copy have no affirmative alert claims', () => {
  const files = [
    'panel.js',
    join('..', '..', 'atlas', 'selectionCard.js'),
  ];
  for (const rel of files) {
    const src = readFileSync(join(here, rel), 'utf8');
    assert.equal(hasForbiddenEventFollowClaim(src), false, rel);
    assert.doesNotMatch(src, /you'?ll be notif/i);
    assert.doesNotMatch(src, /alerts when (?:this|the) event (?:updates|changes)/i);
    assert.doesNotMatch(src, /watching this event around the clock/i);
  }
  // Exported user-facing strings (not the regex catalog) must stay honest.
  for (const copy of [
    EVENT_FOLLOW_UNAVAILABLE_REASON,
    EVENT_FOLLOW_SELECT_NOTE,
    EVENT_FOLLOW_CONTROL_LABEL,
  ]) {
    assert.equal(hasForbiddenEventFollowClaim(copy), false, copy);
    assert.doesNotMatch(copy, /you'?ll be notif/i);
  }
  const avail = readFileSync(join(here, 'followAvailability.js'), 'utf8');
  assert.match(avail, /UNAVAILABLE/);
  assert.match(avail, /selectIsNotFollow/);
});
