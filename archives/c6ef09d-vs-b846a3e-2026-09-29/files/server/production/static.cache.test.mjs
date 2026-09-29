import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheControlFor } from './static.js';

test('HTML and SPA shell are no-store so iPhone cannot keep a stale tip', () => {
  assert.equal(cacheControlFor('/index.html'), 'no-store');
  assert.equal(cacheControlFor('/'), 'no-store');
  assert.equal(cacheControlFor(''), 'no-store');
});

test('fingerprinted assets stay immutable', () => {
  assert.match(
    cacheControlFor('/assets/index-AbCdEfGh.js'),
    /immutable/,
  );
});
