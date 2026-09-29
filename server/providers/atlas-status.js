import { admitKeySetupRequest } from '../../src/keySetupCore.mjs';
import { atlasProviderNames } from '../../src/atlas/providerRegistry.mjs';
import {
  COMMERCIAL_RESTRICTED_SERVICES,
  commercialSafeMode,
} from './policy-flags.js';
import { ownerEntitlements } from '../entitlements/ownerEntitlements.js';
import { appendAuditEvent, readAuditEvents } from '../entitlements/auditLog.js';
import {
  cspAuditSnapshot,
  assertHardeningInvariants,
} from '../hardening/cspAudit.js';
import { PERMISSION_REVIEWED_AT } from '../../src/atlas/dataSourceRegistry.js';
import { openaiAnalystStatus } from '../openaiAnalyst/config.js';
import { worldEventsStatus } from '../../src/events/index.js';
import { resolveCostControls } from '../openaiAnalyst/costControls.js';

/**
 * Earth Eye: read-only provider status for the Provider Settings panel.
 *
 * GET /api/atlas/provider-status → { mode, vars: [{ name, set }] }
 *
 * Presence only, never a value, prefix or length. Uses the same loopback /
 * local-Host / no-proxy admission gate as the upstream POWER UP endpoints, and
 * unlike them it is also installed on `vite preview`, so the panel can say
 * what is configured in a production preview too. Editing stays with the
 * dev-server POWER UP panel or the gitignored .env file.
 */
export function atlasProviderStatus() {
  const install = (mode) => (server) => {
    // Policy flags only (no secrets): the browser reads this at start-up to
    // apply commercial-safe mode to the layer registry.
    server.middlewares.use('/api/atlas/policy', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        return res.end(JSON.stringify({ error: 'Method not allowed' }));
      }
      const on = commercialSafeMode();
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          commercialSafe: on,
          restrictedServices: on
            ? Object.keys(COMMERCIAL_RESTRICTED_SERVICES)
            : [],
        }),
      );
    });
    // Stage 5.4 — owner admin snapshot (no secrets): review + policy flags.
    server.middlewares.use('/api/atlas/owner-summary', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        return res.end(JSON.stringify({ error: 'Method not allowed' }));
      }
      const on = commercialSafeMode();
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ok: true,
          role: 'owner',
          commercialSafe: on,
          powerUpInApp: mode === 'dev',
          powerUpNote:
            mode === 'dev'
              ? 'POWER UP key editing is available in this dev server.'
              : 'Hosted builds: set secrets via fly secrets / .env; POWER UP panel is dev-only (hosted has no in-app billing or admin UI).',
          workspaces: '/api/atlas/workspaces',
          collectionHealth: '/api/atlas/collection-health',
          policy: '/api/atlas/policy',
          openaiAnalyst: {
            ...openaiAnalystStatus(),
            costControls: resolveCostControls(),
            statusPath: '/api/atlas/openai-analyst/status',
          },
          auditLog: '/api/atlas/audit-log',
          routeStatus: '/api/route/status',
          permissionReviewedAt: PERMISSION_REVIEWED_AT,
          excludedHard: [
            'alpr-cameras',
            'traffic',
            'liveatc-audio',
            'fabricated-observations',
          ],
          comms: {
            broadcastify: 'NEEDS_CREDENTIAL / license-review HELD',
            liveatc: 'BLOCKED_BY_PROVIDER_TERMS',
            openmhz: 'PERMISSION_REQUIRED (held)',
            radioreference: 'LICENSE_REQUIRED (held)',
          },
          nav: 'NAV-2 — TomTom Orbis free-tier when TOMTOM_API_KEY set; else OSRM DEMO_FAIR_USE / NEEDS_KEY. Mapbox not wired. Caps: routing 20K/mo, tiles 200K/mo.',
          googlePhotoreal: {
            path: 'A-direct',
            statusPath: '/api/atlas/google-photoreal/status',
            note: 'Billable Map Tiles — OFF until GOOGLE_MAPS_API_KEY via Keys/POWER UP or build-secret. Esri keyless until then.',
          },
          worldEvents: {
            slice: 'EE-EVENTS-1',
            statusPath: '/api/atlas/world-events/status',
            listPath: '/api/atlas/world-events',
            ...worldEventsStatus(),
          },
          permittedHistory: '/api/atlas/permitted-history',
          entitlements: ownerEntitlements(),
          hardening: {
            ...assertHardeningInvariants(cspAuditSnapshot()),
            billingUi: false,
            adminUiExposed: false,
            signup: 'closed',
            mapbox: 'not_wired',
          },
          generatedAt: new Date().toISOString(),
        }),
      );
    });

    server.middlewares.use('/api/atlas/provider-status', (req, res) => {
      const respond = (status, payload) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(payload));
      };
      if (req.method !== 'GET')
        return respond(405, { error: 'Method not allowed' });
      // Dev: loopback/local Host gate (POWER UP adjacency).
      // Hosted preview/production: presence-only JSON; production app.js
      // isOwnerOnlyApi refuses non-owner sessions before this handler runs.
      // Non-owners must use GET /api/atlas/capabilities (sanitized labels).
      if (mode === 'dev') {
        const admission = admitKeySetupRequest({
          method: req.method,
          remoteAddress: req.socket?.remoteAddress,
          hostHeader: req.headers?.host,
          protocol: req.socket?.encrypted ? 'https:' : 'http:',
          origin: req.headers?.origin,
          contentType: req.headers?.['content-type'],
          proxyHeaders: req.headers || {},
          env: process.env,
        });
        if (!admission.ok)
          return respond(admission.status, { error: admission.error });
      }
      respond(200, {
        mode,
        vars: atlasProviderNames().map((name) => ({
          name,
          set: String(process.env[name] ?? '').trim() !== '',
        })),
      });
    });
  };
  return {
    name: 'atlas-provider-status',
    configureServer: install('dev'),
    configurePreviewServer: install('preview'),
  };
}
