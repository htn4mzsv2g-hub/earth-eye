#!/usr/bin/env node
/**
 * Earth Eye production entry point: `npm start` / the container CMD.
 *
 * Serves the built dist/ and the server-side API with plain node:http. Vite is
 * a build-time tool only; nothing on this path imports it.
 *
 * Environment (all optional): PORT (8080), HOST (0.0.0.0), ALLOWED_HOSTS,
 * ALLOWED_HOSTS_ACTION, LOGIN_USER/LOGIN_PASS (legacy names
 * BASIC_AUTH_USER/BASIC_AUTH_PASS also accepted), SESSION_SECRET,
 * ORIGIN_AUTH_HEADER/ORIGIN_AUTH_SECRET, RATE_LIMIT_API_PER_MIN,
 * RATE_LIMIT_METERED_PER_MIN, API_MAX_BODY_BYTES, TRUST_PROXY,
 * TRUST_PROXY_HEADER, REALTIME_DEBUG_LOG, SHUTDOWN_GRACE_MS. See DEPLOY_FLY.md.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDotenvLadder } from './production/env.js';

const root = fileURLToPath(new URL('../', import.meta.url));
// Same precedence as the Vite config: real env (Fly secrets) beats files.
const envFiles = loadDotenvLadder(root, 'production');
// Providers are imported only after the environment is final.
const { createProductionApp } = await import('./production/app.js');

let app;
try {
  app = await createProductionApp({
    distDir: path.join(root, 'dist'),
    env: process.env,
  });
} catch (error) {
  console.error(`[prod] cannot start: ${error.message}`);
  process.exit(1);
}
const { config } = app;
const address = await app.listen();
const on = (value) => (value ? 'on' : 'off');
console.log(
  `[prod] Earth Eye listening on http://${address.address}:${address.port}` +
    ` | env files: ${envFiles.length ? envFiles.join(', ') : 'none'}` +
    ` | host allowlist: ${config.allowedHosts.length ? `${config.allowedHostsAction} (${config.allowedHosts.join(', ')})` : 'off'}` +
    ` | login: ${config.login ? `on (${config.login.source.replace(/_USER$/, '_*')}, sessions ${config.login.sessionSecret ? 'persistent' : 'per-process: set SESSION_SECRET'})` : 'off'}` +
    ` | origin secret: ${on(config.originAuth)}` +
    ` | rate limit/min/IP: api ${config.rateLimitApiPerMin || 'off'}, metered ${config.rateLimitMeteredPerMin || 'off'}`,
);

let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(
    `[prod] ${signal}: draining (up to ${config.shutdownGraceMs} ms)`,
  );
  const force = setTimeout(() => {
    app.server.closeAllConnections();
    console.log('[prod] grace period over; exiting');
    process.exit(0);
  }, config.shutdownGraceMs);
  force.unref();
  app.close().then(() => {
    console.log('[prod] closed cleanly');
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
