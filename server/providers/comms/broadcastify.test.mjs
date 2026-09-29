import test from 'node:test';
import assert from 'node:assert/strict';
import { createBroadcastifyStubMiddleware } from './broadcastify.js';

function mockReqRes() {
  const chunks = [];
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(body) {
      chunks.push(body);
    },
  };
  const req = { resume() {} };
  return { req, res, body: () => JSON.parse(chunks.join('') || 'null') };
}

test('Broadcastify stub returns NEEDS_CREDENTIAL with empty feeds', () => {
  const mw = createBroadcastifyStubMiddleware();
  const { req, res, body } = mockReqRes();
  mw(req, res);
  assert.equal(res.statusCode, 403);
  const json = body();
  assert.equal(json.code, 'NEEDS_CREDENTIAL');
  assert.equal(json.licenseReview, 'held');
  assert.deepEqual(json.feeds, []);
  assert.equal(json.ok, false);
});
