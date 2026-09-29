import { createNwsAlertsLayer } from '../../layers/nwsAlerts/index.js';
/** Wire NWS weather alerts into the application catalog. */
export function createApplicationNwsAlerts(options) {
  return createNwsAlertsLayer(options);
}
