import test from 'node:test';
import assert from 'node:assert/strict';
import { adsbdbProxy } from './enrichment.js';

test('adsbdb proxy never marks routes for disk persistence', () => {
  const plugin = adsbdbProxy();
  assert.equal(plugin._test.routesPersistToDisk, false);
  assert.ok(plugin._test.cachePath.endsWith('adsbdb.json'));
});
