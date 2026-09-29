/**
 * Broadcastify COMMS stub — NEEDS_CREDENTIAL / license-review HELD.
 * Owner held application 2026-09-29 (cost + competing-scanner declines).
 * Do not email, apply, scrape, or invent a catalog.
 */
import {
  commsNeedsCredentialPayload,
} from '../../../src/comms/providers.js';

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

/** Connect middleware: every Broadcastify path returns needs-credential. */
export function createBroadcastifyStubMiddleware() {
  return function broadcastifyStub(req, res) {
    // Never proxy, scrape, or fabricate feeds.
    req.resume?.();
    sendJson(res, 403, commsNeedsCredentialPayload('comms-broadcastify'));
  };
}

export function broadcastifyCommsProxy() {
  const middleware = createBroadcastifyStubMiddleware();
  return {
    name: 'comms-broadcastify-stub',
    configureServer(server) {
      server.middlewares.use('/api/comms/broadcastify', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/comms/broadcastify', middleware);
    },
  };
}
