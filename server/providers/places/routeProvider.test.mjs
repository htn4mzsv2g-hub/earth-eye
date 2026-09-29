import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveRouteProvider,
  routeProviderStatus,
  ROUTE_PROVIDER_IDS,
} from './routeProvider.js';
import {
  createTomTomMonthlyBudget,
  TOMTOM_FREE_CAPS,
  utcMonthKey,
} from './tomtomBudget.js';
import {
  buildTomTomRouteUrl,
  fetchTomTomRoute,
  tomtomRouteGeometry,
  normalizeTomTomSteps,
} from './tomtomOrbisRoute.js';
import { installRouteMiddleware } from './routes.js';

test('without key: OSRM DEMO_FAIR_USE and needsKey for TomTom', () => {
  const p = resolveRouteProvider({ profile: 'car', env: {} });
  assert.equal(p.id, ROUTE_PROVIDER_IDS.OSRM_DEMO);
  assert.equal(p.demoFairUse, true);
  assert.equal(p.needsKey, true);
  assert.match(p.note || '', /TOMTOM_API_KEY/);
});

test('with key: car uses TomTom Orbis LIVE; foot stays OSRM demo', () => {
  const env = { TOMTOM_API_KEY: 'test-key' };
  const car = resolveRouteProvider({ profile: 'car', env });
  assert.equal(car.id, ROUTE_PROVIDER_IDS.TOMTOM_ORBIS);
  assert.equal(car.classification, 'LIVE');
  assert.equal(car.needsKey, false);
  const foot = resolveRouteProvider({ profile: 'foot', env });
  assert.equal(foot.id, ROUTE_PROVIDER_IDS.OSRM_DEMO);
  assert.equal(foot.demoFairUse, true);
});

test('Mapbox is never selected', () => {
  const st = routeProviderStatus({ TOMTOM_API_KEY: 'x' });
  assert.equal(st.mapbox, 'not_wired');
  assert.equal(st.googleAppleGeometry, 'forbidden');
  assert.equal(st.waze, 'not_core');
});

test('monthly budget admits then hard-fails at cap', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-tt-budget-'));
  const filePath = path.join(dir, 'monthly-budget.json');
  const budget = createTomTomMonthlyBudget({
    filePath,
    env: { TOMTOM_MONTHLY_ROUTING_BUDGET: '3' },
  });
  assert.equal(budget.admit('routing').ok, true);
  budget.record('routing', 1);
  budget.record('routing', 1);
  budget.record('routing', 1);
  const denied = budget.admit('routing');
  assert.equal(denied.ok, false);
  assert.equal(denied.error, 'tomtom_budget');
  assert.equal(denied.status.cap, 3);
  assert.equal(TOMTOM_FREE_CAPS.routing, 20_000);
  assert.equal(utcMonthKey(Date.parse('2026-09-29T12:00:00Z')), '2026-09');
});

test('TomTom URL uses lat,lon order and never embeds Mapbox', () => {
  const url = buildTomTomRouteUrl({
    pts: [
      [-97.74, 30.27],
      [-97.75, 30.28],
    ],
    profile: 'car',
    key: 'SECRET',
    withSteps: true,
  });
  assert.match(url, /api\.tomtom\.com\/routing\/1\/calculateRoute\//);
  assert.match(url, /30\.27,-97\.74:30\.28,-97\.75/);
  assert.match(url, /travelMode=car/);
  assert.doesNotMatch(url, /mapbox|google|apple|waze/i);
});

test('fetchTomTomRoute projects geometry and NEEDS_KEY without key', async () => {
  const bare = await fetchTomTomRoute({
    pts: [
      [-97.74, 30.27],
      [-97.75, 30.28],
    ],
    profile: 'car',
    key: '',
  });
  assert.equal(bare.error, 'NEEDS_KEY');

  const fake = {
    routes: [
      {
        summary: { lengthInMeters: 1200, travelTimeInSeconds: 180 },
        legs: [
          {
            points: [
              { latitude: 30.27, longitude: -97.74 },
              { latitude: 30.28, longitude: -97.75 },
            ],
          },
        ],
        guidance: {
          instructions: [
            {
              message: 'Head north',
              maneuver: 'DEPART',
              point: { latitude: 30.27, longitude: -97.74 },
              routeOffsetInMeters: 0,
              travelTimeInSeconds: 0,
            },
          ],
        },
      },
    ],
  };
  const result = await fetchTomTomRoute({
    pts: [
      [-97.74, 30.27],
      [-97.75, 30.28],
    ],
    profile: 'car',
    withSteps: true,
    key: 'k',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => fake,
    }),
  });
  assert.equal(result.error, null);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.provider, 'tomtom-orbis');
  assert.equal(result.payload.classification, 'LIVE');
  assert.deepEqual(result.payload.geometry[0], [-97.74, 30.27]);
  assert.equal(result.payload.steps.length, 1);
  assert.equal(tomtomRouteGeometry(fake.routes[0]).length, 2);
  assert.equal(normalizeTomTomSteps(fake.routes[0]).steps[0].instruction, 'Head north');
});

test('/api/route without key stays OSRM path and labels DEMO_FAIR_USE', async () => {
  const hits = [];
  const stack = {
    use(path, fn) {
      hits.push([path, fn]);
    },
  };
  const budget = createTomTomMonthlyBudget({
    filePath: path.join(os.tmpdir(), `ee-tt-${Date.now()}.json`),
    env: {},
  });
  installRouteMiddleware(stack, {
    env: {},
    budget,
    fetchImpl: async (url) => {
      assert.match(String(url), /routing\.openstreetmap\.de/);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        async text() {
          return JSON.stringify({
            code: 'Ok',
            routes: [
              {
                distance: 500,
                duration: 120,
                geometry: {
                  coordinates: [
                    [-97.74, 30.27],
                    [-97.741, 30.271],
                  ],
                },
                legs: [],
              },
            ],
          });
        },
      };
    },
  });
  const routeHandler = hits.find((h) => h[0] === '/api/route')[1];
  const statusHandler = hits.find((h) => h[0] === '/api/route/status')[1];
  assert.ok(routeHandler);
  assert.ok(statusHandler);

  const statusBody = await invoke(statusHandler, '/api/route/status');
  assert.equal(statusBody.body.tomtomKeyConfigured, false);
  assert.equal(statusBody.body.mapbox, 'not_wired');

  const body = await invoke(
    routeHandler,
    '/api/route?profile=car&coords=-97.74,30.27;-97.741,30.271',
  );
  assert.equal(body.status, 200);
  assert.equal(body.body.ok, true);
  assert.equal(body.body.provider, 'osrm-demo');
  assert.equal(body.body.demoFairUse, true);
  assert.equal(body.body.needsKey, true);
});

test('/api/route with key uses TomTom and records budget', async () => {
  const hits = [];
  const stack = { use(path, fn) { hits.push([path, fn]); } };
  const filePath = path.join(os.tmpdir(), `ee-tt-route-${Date.now()}.json`);
  const budget = createTomTomMonthlyBudget({
    filePath,
    env: { TOMTOM_MONTHLY_ROUTING_BUDGET: '100' },
  });
  let upstream = 0;
  installRouteMiddleware(stack, {
    env: { TOMTOM_API_KEY: 'test-key' },
    budget,
    fetchImpl: async (url) => {
      upstream += 1;
      assert.match(String(url), /api\.tomtom\.com/);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          routes: [
            {
              summary: { lengthInMeters: 800, travelTimeInSeconds: 90 },
              legs: [
                {
                  points: [
                    { latitude: 30.27, longitude: -97.74 },
                    { latitude: 30.271, longitude: -97.741 },
                  ],
                },
              ],
            },
          ],
        }),
      };
    },
  });
  const routeHandler = hits.find((h) => h[0] === '/api/route')[1];
  const body = await invoke(
    routeHandler,
    '/api/route?profile=car&coords=-97.74,30.27;-97.741,30.271',
  );
  assert.equal(body.body.ok, true);
  assert.equal(body.body.provider, 'tomtom-orbis');
  assert.equal(body.body.classification, 'LIVE');
  assert.equal(upstream, 1);
  assert.equal(budget.status('routing').used, 1);
});

function invoke(handler, url) {
  return new Promise((resolve) => {
    const req = { method: 'GET', url, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(code, h) {
        this.statusCode = code;
        Object.assign(this.headers, h || {});
      },
      end(body) {
        resolve({
          status: this.statusCode,
          body: JSON.parse(body || '{}'),
        });
      },
    };
    handler(req, res);
  });
}
