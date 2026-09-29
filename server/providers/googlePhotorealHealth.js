/**
 * Google Photorealistic 3D — provider-health + quota status (Path A).
 *
 * Does NOT proxy Map Tiles (browser→Google with Map Tiles key). Exposes:
 * - GET  /api/atlas/google-photoreal/status
 * - POST /api/atlas/google-photoreal/usage  (client governor reports counts)
 *
 * Safe when key absent: status = OFF / NEEDS_KEY, no billable calls.
 */

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { admitKeySetupRequest } from '../../src/keySetupCore.mjs';
import {
  DEFAULT_DAILY_SOFT,
  DEFAULT_DAILY_HARD,
  DEFAULT_MONTHLY_SOFT,
  DEFAULT_MONTHLY_HARD,
  utcDayKey,
  utcMonthKey,
  normalizeQuotaState,
  evaluateQuota,
  resolveQuotaLimits,
} from '../../src/maps/googlePhotorealQuota.js';

const CACHE_DIR = path.join(process.cwd(), '.gev-cache', 'google-photoreal');
const BUDGET_PATH = path.join(CACHE_DIR, 'budget.json');

function envLimits() {
  return resolveQuotaLimits({
    dailySoft: process.env.GOOGLE_PHOTOREAL_DAILY_SOFT,
    dailyHard: process.env.GOOGLE_PHOTOREAL_DAILY_HARD,
    monthlySoft: process.env.GOOGLE_PHOTOREAL_MONTHLY_SOFT,
    monthlyHard: process.env.GOOGLE_PHOTOREAL_MONTHLY_HARD,
  });
}

function hasGoogleMapsKey() {
  return String(process.env.GOOGLE_MAPS_API_KEY || '').trim() !== '';
}

function hasIonToken() {
  return String(process.env.CESIUM_ION_TOKEN || '').trim() !== '';
}

export function googlePhotorealHealthPayload(budgetRaw, env = process.env) {
  const limits = resolveQuotaLimits({
    dailySoft: env.GOOGLE_PHOTOREAL_DAILY_SOFT,
    dailyHard: env.GOOGLE_PHOTOREAL_DAILY_HARD,
    monthlySoft: env.GOOGLE_PHOTOREAL_MONTHLY_SOFT,
    monthlyHard: env.GOOGLE_PHOTOREAL_MONTHLY_HARD,
  });
  const googleSet = String(env.GOOGLE_MAPS_API_KEY || '').trim() !== '';
  const ionSet = String(env.CESIUM_ION_TOKEN || '').trim() !== '';
  const state = normalizeQuotaState(budgetRaw);
  const quota = evaluateQuota(state, limits);

  let health = 'OFF';
  let code = 'PHOTOREAL_OFF';
  let detail =
    'Google Photorealistic 3D not configured — Esri keyless globe active. Path A uses GOOGLE_MAPS_API_KEY (Map Tiles API).';

  if (quota.stopped || quota.code === 'NEEDS_QUOTA') {
    health = 'NEEDS_QUOTA';
    code = 'NEEDS_QUOTA';
    detail = quota.message;
  } else if (googleSet) {
    health = 'READY_DIRECT';
    code = 'KEY_PRESENT_DIRECT';
    detail =
      'GOOGLE_MAPS_API_KEY is set in this process env (build/runtime). Direct Photoreal path available; billable when tiles load.';
  } else if (ionSet) {
    health = 'READY_ION';
    code = 'KEY_PRESENT_ION';
    detail =
      'CESIUM_ION_TOKEN set — ion-hosted Google 3D available as secondary path. Path A preferred key is still GOOGLE_MAPS_API_KEY.';
  } else {
    health = 'NEEDS_KEY';
    code = 'NEEDS_KEY';
    detail =
      'Add GOOGLE_MAPS_API_KEY via Keys / POWER UP (dev) or fly deploy --build-secret (prod). Do not paste keys in chat.';
  }

  return {
    ok: true,
    path: 'A-direct-google-photoreal',
    health,
    code,
    detail,
    googleMapsKeySet: googleSet,
    cesiumIonTokenSet: ionSet,
    photorealPreferred: 'google-direct',
    fallbackStack: 'esri-imagery',
    finalFallbackStack: 'osm',
    quota,
    limits,
    consoleTips: {
      quotaAlert:
        'Google Cloud Console → APIs & Services → Map Tiles API → Quotas: set a low daily request cap and email alerts.',
      budgetAlert:
        'Google Cloud Console → Billing → Budgets & alerts: create a small budget (e.g. $5–20) with 50/90/100% thresholds.',
      referrer:
        'Restrict the browser key to https://eartheye.us/* and https://eartheye.fly.dev/* (+ http://localhost:* for dev).',
    },
    attributionRequired:
      'Visible Google attribution when Photoreal is active (Map data © Google).',
    generatedAt: new Date().toISOString(),
  };
}

async function readBudget() {
  try {
    return JSON.parse(await fsp.readFile(BUDGET_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function writeBudget(state) {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  await fsp.writeFile(BUDGET_PATH, JSON.stringify(state), 'utf8');
}

function admit(req) {
  return admitKeySetupRequest({
    method: req.method,
    remoteAddress: req.socket?.remoteAddress,
    hostHeader: req.headers?.host,
    protocol: req.socket?.encrypted ? 'https:' : 'http:',
    origin: req.headers?.origin,
    contentType: req.headers?.['content-type'],
    proxyHeaders: req.headers || {},
    env: process.env,
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * @returns {import('vite').Plugin}
 */
export function googlePhotorealHealth() {
  const install = (mode) => (server) => {
    server.middlewares.use(
      '/api/atlas/google-photoreal/status',
      async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        // Status is presence/quota only — allow authenticated production hosts
        // to read health without loopback gate (no secrets in payload).
        const budget = await readBudget();
        const payload = googlePhotorealHealthPayload(budget, process.env);
        payload.mode = mode;
        res.statusCode = 200;
        res.end(JSON.stringify(payload));
      },
    );

    server.middlewares.use(
      '/api/atlas/google-photoreal/usage',
      async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        const admission = admit(req);
        if (!admission.ok) {
          res.statusCode = admission.status;
          return res.end(JSON.stringify({ error: admission.error }));
        }
        try {
          const body = await readJson(req);
          const prev = normalizeQuotaState(await readBudget());
          const next = {
            day: utcDayKey(),
            month: utcMonthKey(),
            dayCount: Math.max(
              prev.dayCount,
              Number(body.dayCount) || prev.dayCount,
            ),
            monthCount: Math.max(
              prev.monthCount,
              Number(body.monthCount) || prev.monthCount,
            ),
            sessions: Math.max(
              prev.sessions,
              Number(body.sessions) || prev.sessions,
            ),
            stopped: Boolean(body.stopped) || prev.stopped,
            stopReason: body.stopReason || prev.stopReason,
          };
          await writeBudget(next);
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              ok: true,
              ...googlePhotorealHealthPayload(next, process.env),
            }),
          );
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e?.message || 'bad json' }));
        }
      },
    );
  };

  return {
    name: 'google-photoreal-health',
    configureServer: install('dev'),
    configurePreviewServer: install('preview'),
  };
}

export {
  DEFAULT_DAILY_SOFT,
  DEFAULT_DAILY_HARD,
  DEFAULT_MONTHLY_SOFT,
  DEFAULT_MONTHLY_HARD,
  envLimits,
  hasGoogleMapsKey,
  hasIonToken,
};
