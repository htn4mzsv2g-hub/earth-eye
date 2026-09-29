/**
 * EE-EVENTS-1 — Tier B/C descriptors live in gdacs.js / gdelt.js / reliefweb.js.
 * Re-export for backward-compatible imports from EE-EVENTS-0 tests/docs.
 */

export { gdacsAdapterDescriptor as gdacsHookDescriptor } from './gdacs.js';
export { reliefWebAdapterDescriptor as reliefWebHookDescriptor } from './reliefweb.js';
export { gdeltAdapterDescriptor as gdeltHookDescriptor } from './gdelt.js';
