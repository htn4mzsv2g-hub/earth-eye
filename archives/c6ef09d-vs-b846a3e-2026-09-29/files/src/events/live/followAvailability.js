/**
 * EE-EVENTS FOLLOW honesty (LIVE_WORLD EE-EVENTS-4 / HANDOFF EE-EVENTS-5).
 *
 * SELECT ≠ FOLLOW for World Events.
 * Follow stays UNAVAILABLE until a real durable retention + notify mechanism exists.
 * Never claim alert delivery or continuous event watch.
 */

/** Honest reason shown on disabled Follow controls and in status copy. */
export const EVENT_FOLLOW_UNAVAILABLE_REASON =
  'UNAVAILABLE — Follow needs a durable followed-events store and a real notify mechanism. Selecting an event is not Following it. No alert delivery and no continuous event-watch claim.';

/** Short control label (button text). */
export const EVENT_FOLLOW_CONTROL_LABEL = 'FOLLOW · UNAVAILABLE';

/** Panel / card disclosure — Select is not Follow. */
export const EVENT_FOLLOW_SELECT_NOTE =
  'SELECT ≠ FOLLOW. This event is selected for detail and RELATED only. Follow stays unavailable until retention + notify exist — no alert delivery, no continuous watch claim.';

/**
 * Affirmative Follow product claims that must never appear for World Events.
 * Denial copy ("no alert delivery") is fine; "you'll be notified" is not.
 * Used by honesty tests (case-insensitive).
 */
export const FORBIDDEN_EVENT_FOLLOW_CLAIM_PATTERNS = Object.freeze([
  /you'?ll be notif/i,
  /we(?:'| wi)?ll notif/i,
  /(?:^|[^a-z])(?:get|receive|enable)s?\s+push\s+notif/i,
  /watching this event around the clock/i,
  /alert(?:s)? when (?:this|the) event (?:updates|changes)/i,
  /(?:^|[^.\n]{0,40})\b24\s*\/\s*7\b(?![^.\n]{0,40}\b(?:not|no|never|unavailable)\b)/i,
  /\bcontinuous(?:ly)?\s+(?:monitor|watch|track)(?![^.\n]{0,20}\b(?:not|no|never|unavailable|claim)\b)/i,
]);

/**
 * World Event Follow availability.
 * Always UNAVAILABLE until retention + notify ship — no feature-flag escape hatch
 * that could silently enable fake Follow.
 *
 * @param {{ eventId?: string|null, selected?: boolean }=} _opts
 * @returns {{ available: false, status: 'UNAVAILABLE', reason: string, following: false, claims: { notifications: false, continuousWatch: false, durableRetention: false }, selectIsNotFollow: true }}
 */
export function eventFollowAvailability(_opts = {}) {
  return Object.freeze({
    available: false,
    status: 'UNAVAILABLE',
    reason: EVENT_FOLLOW_UNAVAILABLE_REASON,
    following: false,
    selectIsNotFollow: true,
    claims: Object.freeze({
      notifications: false,
      continuousWatch: false,
      durableRetention: false,
    }),
  });
}

/**
 * Whether HTML/copy text contains a forbidden Follow product claim.
 * @param {string} text
 */
export function hasForbiddenEventFollowClaim(text) {
  const s = String(text ?? '');
  return FORBIDDEN_EVENT_FOLLOW_CLAIM_PATTERNS.some((re) => re.test(s));
}

/**
 * Stale / lost-source copy for a followed event — reserved for when Follow exists.
 * Today Follow is unavailable, so this documents the contract for tests and future wiring.
 *
 * @param {{ lost?: boolean, stale?: boolean, sourceHealth?: string|null }=} opts
 */
export function eventFollowSourceState(opts = {}) {
  const follow = eventFollowAvailability();
  if (!follow.available) {
    return Object.freeze({
      applicable: false,
      status: 'UNAVAILABLE',
      reason:
        'Stale/lost Follow handling is not active — Follow itself is UNAVAILABLE (no retention).',
      stale: false,
      lost: false,
    });
  }
  // Future path (not reached while available === false).
  const lost = Boolean(opts.lost);
  const stale = Boolean(opts.stale) || opts.sourceHealth === 'STALE';
  let status = 'OK';
  let reason = null;
  if (lost) {
    status = 'LOST';
    reason =
      'Followed event no longer present in the latest source fetch — not proof the real-world event ended.';
  } else if (stale) {
    status = 'STALE';
    reason =
      'Followed event source is STALE — last successful retrieve is older than expected; not a live push.';
  }
  return Object.freeze({
    applicable: true,
    status,
    reason,
    stale,
    lost,
  });
}
