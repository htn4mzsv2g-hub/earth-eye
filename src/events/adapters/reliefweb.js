/**
 * ReliefWeb Tier B — PERMISSION HELD / NEEDS REVIEW.
 *
 * API help says "Anyone can use," but:
 * 1) Site Terms & Conditions grant personal, non-commercial use for Materials
 *    (no resell/redistribute/compile derivative works without more rights).
 * 2) As of 2025-11-01, ReliefWeb requires a pre-approved `appname` for API use.
 *
 * For a commercial/private hosted app: leave PERMISSION HELD — do NOT scrape,
 * do NOT fetch until appname approval + commercial reuse clarity.
 */

export const RELIEFWEB_ADAPTER_ID = 'reliefweb';
export const RELIEFWEB_PROVIDER = 'reliefweb';

export const reliefWebAdapterDescriptor = Object.freeze({
  id: RELIEFWEB_ADAPTER_ID,
  label: 'ReliefWeb',
  provider: RELIEFWEB_PROVIDER,
  layerId: null,
  status: 'HOOK_ONLY',
  kinds: Object.freeze(['HUMANITARIAN REPORT', 'OFFICIAL REPORT']),
  tier: 'B',
  normalize: null,
  fetchHook: null,
  permission: 'PERMISSION HELD',
  notes:
    'Tier B. PERMISSION HELD / NEEDS REVIEW: site T&C personal/non-commercial Materials vs API “anyone can use”; appname pre-approval required since 2025-11-01. Do not scrape. Hook only until cleared.',
});
