import test from 'node:test';
import assert from 'node:assert/strict';
import { createNwsAlertsSource } from './source.js';

test('NWS source bounds requests to the selected two-letter area', async () => {
  const urls = [];
  const source = createNwsAlertsSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return {
        ok: true,
        async json() {
          return { fetchedAt: '2026-09-29T10:00:00Z', alerts: [] };
        },
      };
    },
  });
  source.setArea('tx');
  const snapshot = await source.refresh();
  assert.deepEqual(urls, ['/api/nws-alerts?area=TX']);
  assert.equal(snapshot.count, 0);
  assert.equal(snapshot.error, null);
});
