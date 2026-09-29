import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ownerEntitlements,
  resolveEntitlements,
  FEATURE_FLAG_KEYS,
  isEntitled,
} from './ownerEntitlements.js';

test('owner is fully entitled without billing or admin UI', () => {
  const e = ownerEntitlements();
  assert.equal(e.role, 'owner');
  assert.equal(e.billingStatus, 'not_applicable');
  assert.equal(e.billingProvider, null);
  assert.equal(e.billingUi, false);
  assert.equal(e.stripe, false);
  assert.equal(e.adminUiExposed, false);
  assert.equal(e.bypassesSubscriptionGates, true);
  assert.equal(e.stillSubjectToProviderCosts, true);
  assert.equal(e.stillSubjectToAbuseLimits, true);
  for (const k of FEATURE_FLAG_KEYS) assert.equal(e.featureFlags[k], true);
  assert.equal(isEntitled({ role: 'owner' }, 'auditLog'), true);
});

test('unknown role does not invent a paid plan or expose admin UI', () => {
  const e = resolveEntitlements({ role: 'viewer' });
  assert.equal(e.plan, 'none');
  assert.equal(e.bypassesSubscriptionGates, false);
  assert.equal(e.featureFlags.workspaces, false);
  assert.equal(e.adminUiExposed, false);
  assert.equal(e.billingUi, false);
  assert.equal(isEntitled({ role: 'viewer' }, 'workspaces'), false);
});
