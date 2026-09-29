/**
 * Register built-in World Event adapters (EE-EVENTS-0/1).
 * Tier A: existing EE layers (normalize only; live via server world-events).
 * Tier B: GDACS live; ReliefWeb PERMISSION HELD.
 * Tier C: GDELT NEWS REPORT discovery.
 */

import { ADAPTER_STATUS } from '../eventRegistry.js';
import { nwsAlertAdapterDescriptor } from './nwsAlert.js';
import { usgsEarthquakeAdapterDescriptor } from './usgsEarthquake.js';
import { firmsDetectionAdapterDescriptor } from './firmsDetection.js';
import { firePerimeterAdapterDescriptor } from './firePerimeter.js';
import { cycloneAdapterDescriptor } from './cyclone.js';
import { gdacsAdapterDescriptor } from './gdacs.js';
import { reliefWebAdapterDescriptor } from './reliefweb.js';
import { gdeltAdapterDescriptor } from './gdelt.js';

const BUILTIN = Object.freeze([
  // Tier A (existing EE acquisition — prefer keyless where already in EE)
  { ...nwsAlertAdapterDescriptor, tier: 'A' },
  { ...usgsEarthquakeAdapterDescriptor, tier: 'A' },
  { ...firmsDetectionAdapterDescriptor, tier: 'A' },
  { ...firePerimeterAdapterDescriptor, tier: 'A' },
  { ...cycloneAdapterDescriptor, tier: 'A' },
  // Tier B / C
  gdacsAdapterDescriptor,
  reliefWebAdapterDescriptor,
  gdeltAdapterDescriptor,
]);

/**
 * Register all foundation adapters on a registry (idempotent per fresh registry).
 * @param {ReturnType<import('../eventRegistry.js').createEventRegistry>} registry
 */
export function registerBuiltinAdapters(registry) {
  for (const desc of BUILTIN) {
    const existing = registry.get(desc.id);
    if (existing) continue;
    registry.register({
      ...desc,
      status: desc.status || ADAPTER_STATUS.HOOK_ONLY,
    });
  }
  return registry;
}

export {
  nwsAlertAdapterDescriptor,
  usgsEarthquakeAdapterDescriptor,
  firmsDetectionAdapterDescriptor,
  firePerimeterAdapterDescriptor,
  cycloneAdapterDescriptor,
  gdacsAdapterDescriptor,
  reliefWebAdapterDescriptor,
  gdeltAdapterDescriptor,
  BUILTIN,
};

// Backward-compatible aliases
export {
  gdacsAdapterDescriptor as gdacsHookDescriptor,
  reliefWebAdapterDescriptor as reliefWebHookDescriptor,
  gdeltAdapterDescriptor as gdeltHookDescriptor,
};
