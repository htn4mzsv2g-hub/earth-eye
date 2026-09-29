/**
 * Sanitized capability model (EE-LIVE-2 / Live World Phase 3).
 *
 * GET /api/atlas/capabilities — labels + coarse status only.
 * Never env var names, secret values, or credential metadata.
 */

import { openaiAnalystStatus } from '../openaiAnalyst/config.js';

const trimSet = (env, name) => String(env?.[name] ?? '').trim() !== '';

export const CAPABILITY_STATUSES = Object.freeze([
  'AVAILABLE',
  'DEGRADED',
  'NOT CONFIGURED',
  'KEY REQUIRED',
  'DISABLED',
]);

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function buildCapabilities(env = process.env) {
  const googleMaps = trimSet(env, 'GOOGLE_MAPS_API_KEY');
  const vessels = trimSet(env, 'AISSTREAM_API_KEY');
  const voice = trimSet(env, 'OPENAI_API_KEY');
  const firms = trimSet(env, 'FIRMS_MAP_KEY');
  const ion = trimSet(env, 'CESIUM_ION_TOKEN');
  const tomtom = trimSet(env, 'TOMTOM_API_KEY');
  const openai = openaiAnalystStatus(env);

  const capabilities = [
    {
      id: 'google-photorealistic-3d',
      label: 'GOOGLE PHOTOREALISTIC 3D',
      status: googleMaps ? 'AVAILABLE' : 'NOT CONFIGURED',
    },
    {
      id: 'cesium-ion',
      label: 'CESIUM ION 3D',
      status: ion ? 'AVAILABLE' : 'NOT CONFIGURED',
    },
    {
      id: 'vessels',
      label: 'VESSELS',
      status: vessels ? 'AVAILABLE' : 'KEY REQUIRED',
    },
    {
      id: 'voice-ai',
      label: 'VOICE AI',
      status: voice ? 'AVAILABLE' : 'NOT CONFIGURED',
    },
    {
      id: 'nasa-firms',
      label: 'NASA FIRMS',
      // Keyless public 24h files remain; keyed area API is preferred.
      status: firms ? 'AVAILABLE' : 'DEGRADED',
    },
    {
      id: 'openai',
      label: 'OPENAI',
      status: openai.enabled ? 'AVAILABLE' : 'DISABLED',
    },
    {
      id: 'road-traffic',
      label: 'ROAD TRAFFIC',
      status: tomtom ? 'AVAILABLE' : 'KEY REQUIRED',
    },
    {
      id: 'world-events',
      label: 'WORLD EVENTS',
      // EE-EVENTS-1: Tier A/B/C adapters + honest health. ReliefWeb PERMISSION HELD.
      // FIRMS may report NEEDS KEY. EE-EVENTS-2 markers/filters/disclosure on client.
      status: 'AVAILABLE',
    },
  ];

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    capabilities,
  };
}

/**
 * True when a capabilities payload is free of secret-shaped leakage.
 * @param {unknown} payload
 */
export function capabilitiesAreSanitized(payload) {
  const text = JSON.stringify(payload ?? {});
  if (
    /GOOGLE_MAPS_API_KEY|OPENAI_API_KEY|AISSTREAM|FIRMS_MAP_KEY|CESIUM_ION|TOMTOM_API_KEY|EE_OPENAI|LOGIN_PASS|SESSION_SECRET|APPLE_|GOOGLE_OAUTH/i.test(
      text,
    )
  )
    return false;
  if (/sk-[a-zA-Z0-9]|AIza[0-9A-Za-z_-]{10,}/.test(text)) return false;
  const caps = payload?.capabilities;
  if (!Array.isArray(caps)) return false;
  return caps.every(
    (row) =>
      row &&
      typeof row.id === 'string' &&
      typeof row.label === 'string' &&
      CAPABILITY_STATUSES.includes(row.status) &&
      !('name' in row) &&
      !('set' in row) &&
      !('env' in row) &&
      !('missing' in row),
  );
}

/**
 * Install GET /api/atlas/capabilities on Vite / production Connect stacks.
 */
export function atlasCapabilities() {
  const install = (server) => {
    server.middlewares.use('/api/atlas/capabilities', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        return res.end(JSON.stringify({ error: 'Method not allowed' }));
      }
      res.statusCode = 200;
      res.end(JSON.stringify(buildCapabilities(process.env)));
    });
  };
  return {
    name: 'atlas-capabilities',
    configureServer: install,
    configurePreviewServer: install,
  };
}
