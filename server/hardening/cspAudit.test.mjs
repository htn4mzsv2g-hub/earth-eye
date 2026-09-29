import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cspAuditSnapshot,
  assertHardeningInvariants,
} from './cspAudit.js';
import { earthEyeUserAgent, EE_CONTACT_URL } from './outboundUa.js';
import { EXCLUDED_API_PREFIXES } from '../production/app.js';
import { METERED_API_PREFIXES } from '../production/policy.js';

test('CSP audit invariants hold and billing/admin stay off', () => {
  const snap = cspAuditSnapshot();
  const inv = assertHardeningInvariants(snap);
  assert.equal(inv.ok, true, inv.failures?.join('; '));
  assert.equal(snap.billingUi, false);
  assert.equal(snap.adminUiExposed, false);
  assert.match(snap.loginPage.csp, /default-src 'none'/);
  assert.match(snap.loginPage.csp, /frame-ancestors 'none'/);
});

test('outbound UA identifies Earth Eye with contact URL', () => {
  const ua = earthEyeUserAgent('nav');
  assert.match(ua, /^earth-eye-nav\/1\.0/);
  assert.ok(ua.includes(EE_CONTACT_URL));
});

test('production refuses radio; metered prefixes exclude billing paths', () => {
  assert.ok(EXCLUDED_API_PREFIXES.includes('/api/radio'));
  assert.ok(!METERED_API_PREFIXES.some((p) => /billing|stripe/i.test(p)));
});
