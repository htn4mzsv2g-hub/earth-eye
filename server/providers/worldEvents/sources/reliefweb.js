/**
 * ReliefWeb — PERMISSION HELD / NEEDS REVIEW. Do not fetch. Do not scrape.
 */

import { permissionHeldResult } from '../../../../src/events/worldEventContract.js';

export async function fetchReliefWebWorldEvents() {
  return {
    ...permissionHeldResult({
      adapterId: 'reliefweb',
      source: 'ReliefWeb',
      reason:
        'PERMISSION HELD / NEEDS REVIEW: ReliefWeb site T&C (personal/non-commercial Materials) vs API “anyone can use”; appname pre-approval required since 2025-11-01. Do not scrape. Hook only until commercial reuse + appname cleared.',
    }),
    tier: 'B',
  };
}
