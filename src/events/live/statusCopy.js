/**
 * EE-EVENTS-2 — Honest empty / degraded copy (no endless SYNCING).
 */

const TERMINAL = new Set([
  'READY',
  'EMPTY',
  'DEGRADED',
  'NO DATA',
  'OFFLINE',
  'ERROR',
  'NEEDS KEY',
  'RATE LIMITED',
  'PERMISSION HELD',
  'TERMS UNCLEAR',
  'NEEDS REVIEW',
  'NOT WIRED',
]);

/**
 * Normalize a fetch lifecycle into a discrete UI status.
 * LOADING is allowed once; never stick on SYNCING.
 */
export function uiStatusFromFetch({
  phase,
  health,
  eventCount = 0,
  filteredCount = 0,
  error = null,
} = {}) {
  if (phase === 'loading' && health == null && error == null) {
    return {
      code: 'LOADING',
      tone: 'info',
      title: 'Loading World Events',
      detail: 'One fetch from the live registry — not a continuous sync spinner.',
    };
  }
  if (error) {
    return {
      code: 'OFFLINE',
      tone: 'bad',
      title: 'World Events unavailable',
      detail: String(error),
    };
  }
  const h = TERMINAL.has(health) ? health : health || 'NO DATA';

  if (h === 'NEEDS KEY') {
    return {
      code: 'NEEDS KEY',
      tone: 'key',
      title: 'Source needs a key',
      detail: 'At least one adapter reports NEEDS KEY. Upstream was not contacted for that source.',
    };
  }
  if (h === 'PERMISSION HELD' || h === 'NEEDS REVIEW' || h === 'TERMS UNCLEAR') {
    return {
      code: h,
      tone: 'warn',
      title: 'Permission / terms held',
      detail:
        'A source is PERMISSION HELD or awaiting terms review (e.g. ReliefWeb). No scrape.',
    };
  }
  if (h === 'RATE LIMITED') {
    return {
      code: 'RATE LIMITED',
      tone: 'warn',
      title: 'Rate limited',
      detail: 'A source returned rate limits. Empty list here is honest — not live.',
    };
  }
  if (h === 'OFFLINE' || h === 'ERROR') {
    return {
      code: h,
      tone: 'bad',
      title: 'Sources offline',
      detail: 'Live fetch failed or sources are offline.',
    };
  }
  if (h === 'DEGRADED') {
    return {
      code: 'DEGRADED',
      tone: 'warn',
      title: 'World Events degraded',
      detail:
        'Some sources are READY while others are NEEDS KEY / PERMISSION HELD / RATE LIMITED / OFFLINE. Showing authentic records only.',
      eventCount,
      filteredCount,
    };
  }
  if (filteredCount === 0 && eventCount > 0) {
    return {
      code: 'EMPTY_FILTER',
      tone: 'muted',
      title: 'No events match filters',
      detail: `${eventCount} registry event(s) loaded; none match the current kind / tier / source filters.`,
      eventCount,
      filteredCount: 0,
    };
  }
  if (eventCount === 0 || h === 'EMPTY' || h === 'NO DATA') {
    return {
      code: 'EMPTY',
      tone: 'muted',
      title: 'No World Events in view',
      detail:
        'Registry returned no validated events for this fetch. Empty is honest — not a busy fake feed.',
      eventCount: 0,
      filteredCount: 0,
    };
  }
  return {
    code: 'READY',
    tone: 'ok',
    title: 'World Events',
    detail: `${filteredCount} shown · ${eventCount} in registry fetch (capped).`,
    eventCount,
    filteredCount,
  };
}

/**
 * Summarize per-source health for the panel strip.
 * @param {Array<{id:string, health:string, count?:number, reason?:string, tier?:string}>} sources
 */
export function sourceHealthLines(sources) {
  if (!Array.isArray(sources) || !sources.length) return [];
  return sources.map((s) => ({
    id: s.id,
    tier: s.tier || null,
    health: s.health || 'UNKNOWN',
    count: Number.isFinite(s.count) ? s.count : 0,
    reason: s.reason || null,
    attention: [
      'DEGRADED',
      'NEEDS KEY',
      'PERMISSION HELD',
      'RATE LIMITED',
      'OFFLINE',
      'ERROR',
      'NEEDS REVIEW',
      'TERMS UNCLEAR',
    ].includes(s.health),
  }));
}
