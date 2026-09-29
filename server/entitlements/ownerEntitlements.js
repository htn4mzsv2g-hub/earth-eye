/**
 * Stage 5.4 — server-side owner entitlements (no billing UI, no Stripe).
 * Owner always entitled for product gates; still subject to external provider
 * charges/limits and abuse protection. Admin UI stays hidden; signup closed.
 * No spend opened here.
 */

export const OWNER_ROLE = 'owner';

/** Feature flags the product may gate later. Owner gets all true. */
export const FEATURE_FLAG_KEYS = Object.freeze([
  'workspaces',
  'permittedHistory',
  'incidentWorkspace',
  'ownerAdmin',
  'collection',
  'analystTools',
  'commsStub',
  'navRoadmap',
  'auditLog',
]);

/**
 * Resolve entitlements for a session role.
 * @param {{ role?: string, userId?: string|null }} [session]
 */
export function resolveEntitlements(session = {}) {
  const role = String(session.role || OWNER_ROLE).toLowerCase();
  const isOwner = role === OWNER_ROLE || role === 'admin';
  const flags = Object.fromEntries(
    FEATURE_FLAG_KEYS.map((k) => [k, isOwner]),
  );
  return Object.freeze({
    role: isOwner ? OWNER_ROLE : role || 'user',
    plan: isOwner ? 'owner' : 'none',
    billingStatus: 'not_applicable',
    billingProvider: null,
    billingUi: false,
    stripe: false,
    adminUiExposed: false,
    featureFlags: Object.freeze(flags),
    bypassesSubscriptionGates: isOwner,
    stillSubjectToProviderCosts: true,
    stillSubjectToAbuseLimits: true,
    note: isOwner
      ? 'Owner entitlements are granted server-side. No Stripe/billing UI. Admin UI hidden. Provider keys and rate limits still apply.'
      : 'Non-owner plans are not configured; registration remains closed.',
  });
}

/** Convenience for the single-owner hosted build. */
export function ownerEntitlements() {
  return resolveEntitlements({ role: OWNER_ROLE });
}

/** True when a feature flag is granted for this session. */
export function isEntitled(session, featureFlag) {
  const e = resolveEntitlements(session);
  if (!e.bypassesSubscriptionGates) return false;
  return Boolean(e.featureFlags[featureFlag]);
}
