import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createProductionApp,
  isOwnerOnlyApi,
} from '../../server/production/app.js';
import { atlasCapabilities } from '../../server/providers/capabilities.js';
import { atlasProviderStatus } from '../../server/providers/atlas-status.js';
import {
  capabilitiesAreSanitized,
  buildCapabilities,
} from '../../server/providers/capabilities.js';

const USER = 'testuser';
const PASS = 'test-pass-123';
const REV_USER = 'ee-reviewer';
const REV_PASS = 'rev-pass-123';
const SECRET = 'x'.repeat(48);
const INDEX_HTML =
  '<!doctype html><html><head><title>Earth Eye app</title></head><body>app</body></html>';
const HTML = { Accept: 'text/html,application/xhtml+xml' };

async function makeDist(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ee-live2-dist-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'index.html'), INDEX_HTML);
  return dir;
}

function live2Plugins() {
  return [atlasProviderStatus(), atlasCapabilities()];
}

async function start(t, env = {}) {
  const distDir = await makeDist(t);
  const app = await createProductionApp({
    distDir,
    env: {
      LOGIN_USER: USER,
      LOGIN_PASS: PASS,
      SESSION_SECRET: SECRET,
      REVIEWER_USER: REV_USER,
      REVIEWER_PASS: REV_PASS,
      ...env,
    },
    plugins: live2Plugins(),
  });
  const address = await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  return { app, port: address.port };
}

function request(port, pathName, { method = 'GET', headers = {}, body } = {}) {
  headers = Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value !== undefined),
  );
  if (body !== undefined)
    headers = { ...headers, 'Content-Length': Buffer.byteLength(body) };
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathName, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function postLogin(port, fields) {
  return request(port, '/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: `http://127.0.0.1:${port}`,
      Host: `127.0.0.1:${port}`,
      ...HTML,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function cookieFrom(res) {
  const raw = res.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return String(first || '').split(';')[0];
}

test('isOwnerOnlyApi: provider-status owner-only; capabilities open', () => {
  assert.equal(isOwnerOnlyApi('/api/atlas/provider-status'), true);
  assert.equal(isOwnerOnlyApi('/api/atlas/capabilities'), false);
});

test('EE-LIVE-2 Phase 4: login card has no setup/env leakage; Terms/Privacy honest', async (t) => {
  const { port } = await start(t);
  const page = await request(port, '/login', { headers: HTML });
  assert.equal(page.status, 200);
  assert.match(page.text, /CURRENTLY UNAVAILABLE/);
  assert.doesNotMatch(
    page.text,
    /CONFIGURATION REQUIRED|What to configure|APPLE_CLIENT_ID|GOOGLE_OAUTH|auth\/apple\/callback/,
  );
  const terms = await request(port, '/terms', { headers: HTML });
  assert.equal(terms.status, 200);
  assert.match(terms.text, /private beta/i);
  assert.match(terms.text, /not published yet/i);
  const privacy = await request(port, '/privacy', { headers: HTML });
  assert.equal(privacy.status, 200);
  assert.match(privacy.text, /private beta/i);
});

test('EE-LIVE-2 Phase 3: reviewer capabilities OK; provider-status 403; owner both', async (t) => {
  const { port } = await start(t);

  const rev = await postLogin(port, {
    username: REV_USER,
    password: REV_PASS,
  });
  assert.equal(rev.status, 303);
  const revCookie = cookieFrom(rev);

  const revCaps = await request(port, '/api/atlas/capabilities', {
    headers: { Cookie: revCookie, Accept: 'application/json' },
  });
  assert.equal(revCaps.status, 200);
  const revBody = JSON.parse(revCaps.text);
  assert.equal(capabilitiesAreSanitized(revBody), true);
  assert.doesNotMatch(revCaps.text, /GOOGLE_MAPS_API_KEY|OPENAI_API_KEY|AISSTREAM/);

  const revStatus = await request(port, '/api/atlas/provider-status', {
    headers: { Cookie: revCookie, Accept: 'application/json' },
  });
  assert.equal(revStatus.status, 403);
  assert.match(revStatus.text, /Owner only|owner-only/i);

  const owner = await postLogin(port, { username: USER, password: PASS });
  assert.equal(owner.status, 303);
  const ownerCookie = cookieFrom(owner);

  const ownerCaps = await request(port, '/api/atlas/capabilities', {
    headers: { Cookie: ownerCookie, Accept: 'application/json' },
  });
  assert.equal(ownerCaps.status, 200);
  assert.equal(capabilitiesAreSanitized(JSON.parse(ownerCaps.text)), true);

  const ownerStatus = await request(port, '/api/atlas/provider-status', {
    headers: { Cookie: ownerCookie, Accept: 'application/json' },
  });
  assert.equal(ownerStatus.status, 200);
  const statusBody = JSON.parse(ownerStatus.text);
  assert.ok(Array.isArray(statusBody.vars));
});

test('buildCapabilities baseline vocabulary', () => {
  const payload = buildCapabilities({});
  assert.equal(capabilitiesAreSanitized(payload), true);
  const vessels = payload.capabilities.find((c) => c.id === 'vessels');
  assert.equal(vessels.status, 'KEY REQUIRED');
  const openai = payload.capabilities.find((c) => c.id === 'openai');
  assert.equal(openai.status, 'DISABLED');
});
