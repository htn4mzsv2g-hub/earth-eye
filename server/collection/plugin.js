/**
 * Vite/production plugin: starts the collection scheduler with the server
 * and exposes GET /api/atlas/collection-health + /api/atlas/permitted-history.
 */
import { createCollectionScheduler } from './scheduler.js';
import { installPermittedHistoryRoutes } from './historyApi.js';

let singleton = null;

export function getCollectionScheduler() {
  return singleton;
}

export function collectionPlugin({ enabled = true } = {}) {
  const start = (server) => {
    if (!singleton) {
      singleton = createCollectionScheduler({
        enabled: enabled && process.env.EE_COLLECTION !== '0',
      });
      singleton.start();
      const stop = () => singleton?.stop();
      process.once('SIGTERM', stop);
      process.once('SIGINT', stop);
      server?.httpServer?.once?.('close', stop);
    }
    server.middlewares.use('/api/atlas/collection-health', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        return res.end(JSON.stringify({ error: 'Method not allowed' }));
      }
      res.statusCode = 200;
      res.end(JSON.stringify(singleton.status()));
    });
    installPermittedHistoryRoutes(server, {
      getScheduler: () => singleton,
    });
  };
  return {
    name: 'earth-eye-collection',
    configureServer: start,
    configurePreviewServer: start,
  };
}
