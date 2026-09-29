// Stage 2 perf: health patch updates DOM in place (no full rebuild).
import test from 'node:test';
import assert from 'node:assert/strict';
import { patchDataSourcesHealth } from './dataSourcesPanel.js';

test('patchDataSourcesHealth returns false when the panel has no rows yet', () => {
  const body = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  assert.equal(
    patchDataSourcesHealth({
      dataManager: { getAll: () => [] },
      body,
      state: {},
    }),
    false,
  );
});

test('patchDataSourcesHealth mutates health attrs/text on existing row nodes', async () => {
  const now = Date.now();
  const healthBadge = {
    textContent: 'ONLINE',
    dataset: { tone: 'live', health: 'online' },
  };
  const detail = { textContent: 'Provider answering normally.' };
  const success = { innerHTML: 'x' };
  const attempt = { innerHTML: 'y' };
  const toggle = {
    textContent: 'Turn off',
    setAttribute() {},
  };
  const li = {
    dataset: { sourceId: 'earthquakes', health: 'online', on: 'true' },
    querySelector(sel) {
      if (sel.includes('.ee-health')) return healthBadge;
      if (sel.includes('[data-health-detail]')) return detail;
      if (sel.includes('[data-last-success]')) return success;
      if (sel.includes('[data-last-attempt]')) return attempt;
      if (sel.includes('[data-layer-toggle')) return toggle;
      return null;
    },
  };
  const body = {
    querySelector(sel) {
      if (sel === '[data-source-id]') return li;
      if (sel === '[data-health-legend]') return null;
      if (sel.includes('data-cctv-health')) return null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-source-id]') return [li];
      return [];
    },
  };
  const layers = [
    {
      id: 'earthquakes',
      name: 'Earthquakes',
      enabled: true,
      showInTogglePanel: true,
      stats: {
        count: 3,
        error: 'HTTP 429 Too Many Requests',
        managerLastAttemptAt: now,
        managerLastSuccessAt: now - 60_000,
        lastUpdate: now - 60_000,
      },
    },
  ];
  // Seed the store so sourceHealth sees the failure.
  const { sourceStatus } = await import('./dataSourcesPanel.js');
  sourceStatus.reportLayers(layers);
  assert.equal(
    patchDataSourcesHealth({
      dataManager: { getAll: () => layers },
      body,
      state: {},
    }),
    true,
  );
  assert.equal(li.dataset.health, 'rate limited');
  assert.equal(healthBadge.textContent, 'RATE LIMITED');
  assert.match(detail.textContent, /rate limit/i);
});
