/**
 * EE-EVENTS-1 — World Events status + list (compat re-export).
 * Prefer importing from ./worldEvents/index.js.
 */

export {
  atlasWorldEvents as atlasWorldEventsStatus,
  atlasWorldEvents,
  createWorldEventsOrchestrator,
} from './worldEvents/index.js';
