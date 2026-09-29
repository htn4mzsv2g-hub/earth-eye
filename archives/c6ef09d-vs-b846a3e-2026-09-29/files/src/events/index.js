/**
 * EE-EVENTS-0/1 — World Events public surface.
 *
 * Contract + registry + Tier A/B/C adapters.
 * Live fetches run server-side (world-events orchestrator).
 * Globe markers / filters / disclosure: src/events/live (EE-EVENTS-2).
 * Detail + RELATED: src/events/live. Follow UNAVAILABLE until retention + notify.
 */

import {
  createEventRegistry,
  getDefaultEventRegistry,
  resetDefaultEventRegistry,
  ADAPTER_STATUS,
} from './eventRegistry.js';
import { registerBuiltinAdapters } from './adapters/index.js';
import {
  EVENT_KINDS,
  GEOMETRY_PRECISIONS,
  REVISION_STATES,
  EVENT_HEALTH,
  validateWorldEvent,
  createWorldEvent,
  qualifyEventId,
  precisionAllowsPoint,
  isImpreciseGeography,
  emptyEventResult,
  notWiredEventResult,
  sourceHealthResult,
  permissionHeldResult,
  termsUnclearResult,
  needsKeyResult,
  rateLimitedResult,
  offlineResult,
} from './worldEventContract.js';

/** Populate (once) the default registry with built-in adapters + hooks. */
export function ensureWorldEventsFoundation() {
  const registry = getDefaultEventRegistry();
  registerBuiltinAdapters(registry);
  return registry;
}

/**
 * Honest status payload for capability / owner-summary surfaces (foundation only).
 * Live per-source health is merged by the server orchestrator.
 * Safe to call from server or browser (pure).
 */
export function worldEventsStatus(now = () => Date.now()) {
  const registry = ensureWorldEventsFoundation();
  const snap = registry.health();
  return Object.freeze({
    ...snap,
    generatedAt: new Date(now()).toISOString(),
  });
}

export {
  createEventRegistry,
  getDefaultEventRegistry,
  resetDefaultEventRegistry,
  registerBuiltinAdapters,
  ADAPTER_STATUS,
  EVENT_KINDS,
  GEOMETRY_PRECISIONS,
  REVISION_STATES,
  EVENT_HEALTH,
  validateWorldEvent,
  createWorldEvent,
  qualifyEventId,
  precisionAllowsPoint,
  isImpreciseGeography,
  emptyEventResult,
  notWiredEventResult,
  sourceHealthResult,
  permissionHeldResult,
  termsUnclearResult,
  needsKeyResult,
  rateLimitedResult,
  offlineResult,
};
