import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CCTV_PACK_PERMISSIONS,
  packAllowed,
  packStatusLabel,
  publicPackPermissions,
} from '../server/providers/cctv/permissions.js';

test('pending CCTV packs stay off unless the owner approves them', () => {
  assert.equal(packAllowed('austin', {}), false);
  assert.equal(packAllowed('austin', { CCTV_AUSTIN_ENABLED: '1' }), true);
  assert.equal(packAllowed('caltrans', {}), true);
  assert.equal(packAllowed('caltrans', { CCTV_CALTRANS_ENABLED: '0' }), false);
  assert.equal(
    packAllowed('no-such-pack', { CCTV_NO_SUCH_PACK_ENABLED: '1' }),
    false,
  );
});

test('Maryland CHART and DelDOT are held: off even with the env switch', () => {
  for (const pack of ['maryland', 'deldot']) {
    assert.equal(CCTV_PACK_PERMISSIONS[pack].review, 'held');
    assert.equal(packAllowed(pack, {}), false);
    assert.equal(
      packAllowed(pack, { [`CCTV_${pack.toUpperCase()}_ENABLED`]: '1' }),
      false,
    );
    const rec = publicPackPermissions({}).find((p) => p.pack === pack);
    assert.equal(rec.enabled, false);
    assert.equal(rec.status, 'HELD');
  }
});

test('Ontario 511 is KEY REQUIRED: never approved, never served', () => {
  const on = CCTV_PACK_PERMISSIONS.ontario;
  assert.equal(on.review, 'key-required');
  assert.notEqual(on.review, 'approved');
  assert.equal(packAllowed('ontario', {}), false);
  assert.equal(packAllowed('ontario', { CCTV_ONTARIO_ENABLED: '1' }), false);
  assert.equal(packStatusLabel('ontario', {}), 'KEY REQUIRED');
  const rec = publicPackPermissions({}).find((p) => p.pack === 'ontario');
  assert.equal(rec.status, 'KEY REQUIRED');
  assert.equal(rec.keyRequired, true);
  assert.equal(rec.enabled, false);
});

test('fire-camera packs are flagged non-commercial and not loaded', () => {
  for (const pack of ['alertcalifornia', 'hpwren']) {
    const r = CCTV_PACK_PERMISSIONS[pack];
    assert.equal(r.commercialUse, 'non-commercial', pack);
    assert.equal(r.review, 'not-implemented', pack);
    assert.equal(
      packAllowed(pack, { [`CCTV_${pack.toUpperCase()}_ENABLED`]: '1' }),
      false,
    );
  }
});

test('commercial-safe mode refuses every pack not cleared for commercial use', () => {
  const env = { EE_COMMERCIAL_SAFE: '1', CCTV_AUSTIN_ENABLED: '1' };
  for (const [pack, r] of Object.entries(CCTV_PACK_PERMISSIONS)) {
    if (r.commercialUse !== 'allowed')
      assert.equal(packAllowed(pack, env), false, pack);
  }
  // Approved, commercially open packs stay on.
  assert.equal(packAllowed('fintraffic', env), true);
  assert.equal(packStatusLabel('austin', env), 'OFF (COMMERCIAL-SAFE)');
  assert.ok(publicPackPermissions(env).every((p) => p.commercialSafe === true));
});

test('every pack record carries permissions, a licence and a review date', () => {
  const states = [
    'pending',
    'approved',
    'held',
    'key-required',
    'not-implemented',
  ];
  for (const [pack, r] of Object.entries(CCTV_PACK_PERMISSIONS)) {
    for (const k of ['display', 'embed', 'proxy', 'store', 'export', 'analyze'])
      assert.ok(r.permissions[k], `${pack}.${k}`);
    assert.ok(states.includes(r.review), pack);
    assert.ok(r.evidence, pack);
  }
  for (const p of publicPackPermissions({})) {
    assert.match(p.reviewedAt, /^\d{4}-\d{2}-\d{2}$/, p.pack);
    assert.ok(p.license && p.license.length > 3, p.pack);
    assert.ok(p.status, p.pack);
  }
});

test('pack health break-test: blocked network and 429 show OFFLINE, never "no cameras"; held/key packs say so', async (t) => {
  const { createCctvCatalog } =
    await import('../server/providers/cctv/catalog.js');
  const saved = { ...process.env };
  t.after(() => {
    for (const k of Object.keys(process.env))
      if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  delete process.env.CCTV_SOURCES_FILE;
  delete process.env.CCTV_SOURCES_JSON;
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  let mode = 'block';
  t.mock.method(globalThis, 'fetch', async () => {
    if (mode === 'block') throw new TypeError('fetch failed');
    return new Response('Too Many Requests', { status: 429 });
  });
  for (mode of ['block', '429']) {
    const catalog = createCctvCatalog({ sourceRoot: '/nonexistent' });
    const before = catalog.health();
    assert.ok(before.every((h) => h.lastAttemptAt === null));
    await catalog();
    const health = catalog.health();
    const by = Object.fromEntries(health.map((h) => [h.pack, h]));
    for (const h of health) {
      if (h.status === 'APPROVED') {
        assert.equal(h.state, 'offline', `${mode}: ${h.pack}`);
        assert.ok(h.lastAttemptAt, `${h.pack} attempt time`);
        assert.equal(h.lastSuccessAt, null);
        assert.ok(h.error, `${h.pack} error text`);
      }
    }
    assert.equal(by.ontario.state, 'key required');
    assert.equal(by.deldot.state, 'held');
  }
});
