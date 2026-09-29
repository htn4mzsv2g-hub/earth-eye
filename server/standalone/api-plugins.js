import { localProviderPlugins } from '../providers/local.js';
import { apiNotFoundPlugin } from './api-not-found.js';

/**
 * The application's server-side API, as the ordered plugin list both runtimes
 * mount: Vite dev/preview (server/standalone/vite.config.js) and the
 * standalone production server (server/production/app.js). One list, so the
 * two can never drift apart. The 404 fallback stays last.
 */
export function applicationApiPlugins() {
  return [...localProviderPlugins(), apiNotFoundPlugin()];
}
