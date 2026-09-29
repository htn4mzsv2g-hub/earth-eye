import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import zlib from 'node:zlib';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProductionApp } from '../../server/production/app.js';
import { createMiddlewareStack } from '../../server/production/middleware-stack.js';
import {
  clientAddress,
  createFixedWindowLimiter,
  isMeteredApiPath,
  resolveProductionConfig,
} from '../../server/production/policy.js';
import {
  cacheControlFor,
  negotiateEncoding,
} from '../../server/production/static.js';
import { loadDotenvLadder } from '../../server/production/env.js';
import { analyzeModule } from '../../scripts/module-analysis.mjs';
import { atlasProviderNames } from '../atlas/providerRegistry.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const INDEX_HTML = `<!doctype html><html><head><title>Earth Eye</title></head><body>${'<p>globe</p>'.repeat(200)}</body></html>`;
const HASHED_JS = `export const answer = 42;\n${'// padding\n'.repeat(300)}`;

async function makeDist(t) {
  const parent = await mkdtemp(path.join(tmpdir(), 'eartheye-prod-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const dir = path.join(parent, 'dist');
  await mkdir(dir);
  await writeFile(path.join(parent, 'outside-dist.txt'), 'outside');
  await mkdir(path.join(dir, 'assets'));
  await mkdir(path.join(dir, 'cesium'));
  await writeFile(path.join(dir, 'index.html'), INDEX_HTML);
  await writeFile(path.join(dir, 'assets', 'index-AbCd1234.js'), HASHED_JS);
  await writeFile(path.join(dir, 'assets', 'style-ZyXw9876.css'), 'body{}');
  await writeFile(path.join(dir, 'cesium', 'Cesium.js'), 'var Cesium={};');
  await writeFile(path.join(dir, 'logo.svg'), '<svg/>');
  await writeFile(path.join(dir, 'model.glb'), Buffer.from([0x67, 0x6c]));
  await writeFile(path.join(dir, '.secret'), 'nope');
  return dir;
}

/** A tiny provider plugin shaped exactly like the real ones. */
function echoPlugin() {
  return {
    name: 'echo',
    configurePreviewServer(server) {
      server.middlewares.use('/api/echo', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            url: req.url,
            originalUrl: req.originalUrl,
            method: req.method,
          }),
        );
      });
      server.middlewares.use('/api/google/nearby-places', (_req, res) =>
        res.end('{"ok":true}'),
      );
      server.middlewares.use('/api/boom', async () => {
        throw new Error('handler exploded with detail');
      });
      server.middlewares.use('/api', (_req, res) => {
        res.statusCode = 404;
        res.end('{"error":"Unknown API route"}');
      });
    },
    configureServer() {
      throw new Error('dev-only hook must never run in production');
    },
  };
}

async function start(t, { env = {}, plugins = [echoPlugin()] } = {}) {
  const distDir = await makeDist(t);
  const app = await createProductionApp({ distDir, env, plugins });
  const address = await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  return { app, port: address.port, distDir };
}

function request(port, pathName, { method = 'GET', headers = {}, body } = {}) {
  if (body !== undefined && !headers['Transfer-Encoding'])
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
            body: Buffer.concat(chunks),
            text: () => Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test('static: MIME types, cache policy, ETag revalidation and HEAD', async (t) => {
  const { port } = await start(t);
  const index = await request(port, '/');
  assert.equal(index.status, 200);
  assert.equal(index.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(index.headers['cache-control'], 'no-cache');
  assert.equal(index.text(), INDEX_HTML);

  const js = await request(port, '/assets/index-AbCd1234.js');
  assert.equal(js.headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal(
    js.headers['cache-control'],
    'public, max-age=31536000, immutable',
  );
  assert.equal(js.text(), HASHED_JS);

  const css = await request(port, '/assets/style-ZyXw9876.css');
  assert.equal(css.headers['content-type'], 'text/css; charset=utf-8');
  const svg = await request(port, '/logo.svg');
  assert.equal(svg.headers['content-type'], 'image/svg+xml');
  assert.equal(svg.headers['cache-control'], 'public, max-age=3600');
  const glb = await request(port, '/model.glb');
  assert.equal(glb.headers['content-type'], 'model/gltf-binary');
  const cesium = await request(port, '/cesium/Cesium.js');
  assert.equal(cesium.headers['cache-control'], 'public, max-age=3600');

  const revalidated = await request(port, '/assets/index-AbCd1234.js', {
    headers: { 'If-None-Match': js.headers.etag },
  });
  assert.equal(revalidated.status, 304);
  assert.equal(revalidated.body.length, 0);

  const head = await request(port, '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers['content-length']), INDEX_HTML.length);

  const post = await request(port, '/', { method: 'POST', body: 'x' });
  assert.equal(post.status, 405);
});

test('static: brotli and gzip for compressible files only', async (t) => {
  const { port } = await start(t);
  const br = await request(port, '/assets/index-AbCd1234.js', {
    headers: { 'Accept-Encoding': 'gzip, br' },
  });
  assert.equal(br.headers['content-encoding'], 'br');
  assert.equal(br.headers.vary, 'Accept-Encoding');
  assert.equal(zlib.brotliDecompressSync(br.body).toString(), HASHED_JS);

  const gz = await request(port, '/', {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.equal(zlib.gunzipSync(gz.body).toString(), INDEX_HTML);

  const glb = await request(port, '/model.glb', {
    headers: { 'Accept-Encoding': 'br' },
  });
  assert.equal(glb.headers['content-encoding'], undefined);
  assert.equal(negotiateEncoding('br;q=0, gzip'), 'gzip');
  assert.equal(negotiateEncoding('identity'), null);
  assert.equal(negotiateEncoding('*'), 'br');
  assert.equal(
    cacheControlFor('/assets/x-12345678.js'),
    'public, max-age=31536000, immutable',
  );
});

test('static: SPA fallback, 404s, traversal and dotfiles', async (t) => {
  const { port } = await start(t);
  const spa = await request(port, '/some/client/route', {
    headers: { Accept: 'text/html' },
  });
  assert.equal(spa.status, 200);
  assert.equal(spa.text(), INDEX_HTML);
  assert.equal(spa.headers['cache-control'], 'no-cache');
  assert.equal((await request(port, '/assets/missing.js')).status, 404);
  assert.equal((await request(port, '/.secret')).status, 404);
  assert.equal((await request(port, '/../outside-dist.txt')).status, 404);
  assert.equal((await request(port, '/%2e%2e/outside-dist.txt')).status, 404);
  assert.equal((await request(port, '/%E0%A4%A')).status, 400);
});

test('healthz answers without consuming gates and every response carries security headers', async (t) => {
  const { port } = await start(t, {
    env: {
      ALLOWED_HOSTS: 'eartheye.us',
      BASIC_AUTH_USER: 'ruben',
      BASIC_AUTH_PASS: 'pw',
    },
  });
  const health = await request(port, '/healthz', {
    headers: { Host: 'eartheye.fly.dev' },
  });
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.text()).ok, true);
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.equal(health.headers['x-frame-options'], 'DENY');
  assert.equal(
    health.headers['content-security-policy'],
    "frame-ancestors 'none'",
  );
  assert.equal(health.headers['x-content-type-options'], 'nosniff');
  assert.equal(
    health.headers['referrer-policy'],
    'strict-origin-when-cross-origin',
  );
  assert.equal(health.headers['strict-transport-security'], undefined);
});

test('HSTS only for HTTPS requests in production behind a trusted proxy', async (t) => {
  const { port } = await start(t, {
    env: { NODE_ENV: 'production', TRUST_PROXY: '1' },
  });
  const https = await request(port, '/', {
    headers: { 'X-Forwarded-Proto': 'https' },
  });
  assert.equal(https.headers['strict-transport-security'], 'max-age=31536000');
  const plain = await request(port, '/');
  assert.equal(plain.headers['strict-transport-security'], undefined);

  const { port: localPort } = await start(t, { env: {} });
  const untrusted = await request(localPort, '/', {
    headers: { 'X-Forwarded-Proto': 'https' },
  });
  assert.equal(untrusted.headers['strict-transport-security'], undefined);
});

test('API: plugins mount through configurePreviewServer with Connect semantics', async (t) => {
  const { port, app } = await start(t);
  assert.deepEqual(app.routes(), [
    '/api/echo',
    '/api/google/nearby-places',
    '/api/boom',
    '/api',
  ]);
  const echo = JSON.parse((await request(port, '/api/echo/list?x=1')).text());
  assert.deepEqual(echo, {
    url: '/list?x=1',
    originalUrl: '/api/echo/list?x=1',
    method: 'GET',
  });
  const root = JSON.parse((await request(port, '/api/echo?q')).text());
  assert.equal(root.url, '/?q');
  const notMounted = await request(port, '/api/echoes');
  assert.equal(notMounted.status, 404);
  const boom = await request(port, '/api/boom');
  assert.equal(boom.status, 500);
  assert.doesNotMatch(boom.text(), /exploded/);
});

test('API: the real application routes are mounted (provider-status, 404 fallback)', async (t) => {
  const distDir = await makeDist(t);
  const app = await createProductionApp({ distDir, env: {} });
  const { port } = await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const routes = app.routes();
  for (const route of [
    '/api/atlas/provider-status',
    '/api/cctv',
    '/api/ais-live',
    '/api/opensky',
    '/api/google/nearby-places',
    '/api/realtime/token',
  ])
    assert.ok(routes.includes(route), `${route} is mounted`);
  assert.equal(routes.at(-1), '/api', 'the 404 fallback is last');
  assert.equal(
    routes.includes('/api/setup/keys'),
    false,
    'the dev-only key editor is not mounted in production',
  );
  const unknown = await request(port, '/api/definitely-not-a-route');
  assert.equal(unknown.status, 404);
  assert.deepEqual(JSON.parse(unknown.text()), { error: 'Unknown API route' });
});

test('provider-status reports set/unset only and never leaks key values', async (t) => {
  const names = atlasProviderNames();
  const saved = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const sentinel = (name) => `SENTINEL-${name}-v4lue-9f8e7d`;
  for (const name of names) process.env[name] = sentinel(name);

  const distDir = await makeDist(t);
  const app = await createProductionApp({ distDir, env: {} });
  const { port } = await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const res = await request(port, '/api/atlas/provider-status');
  assert.equal(res.status, 200);
  const text = res.text();
  assert.doesNotMatch(text, /SENTINEL|v4lue/);
  const payload = JSON.parse(text);
  assert.ok(payload.vars.length >= names.length);
  for (const entry of payload.vars) {
    assert.deepEqual(Object.keys(entry).sort(), ['name', 'set']);
    assert.equal(entry.set, true);
  }
  // Behind any proxy (Fly, Cloudflare) the status panel refuses to answer.
  const proxied = await request(port, '/api/atlas/provider-status', {
    headers: {
      'Fly-Client-IP': '203.0.113.9',
      'X-Forwarded-For': '203.0.113.9',
    },
  });
  assert.equal(proxied.status, 403);
  assert.doesNotMatch(proxied.text(), /SENTINEL/);
});

test('API rate limits: general and stricter metered tiers, 429 with Retry-After', async (t) => {
  const { port } = await start(t, {
    env: { RATE_LIMIT_API_PER_MIN: '5', RATE_LIMIT_METERED_PER_MIN: '2' },
  });
  const metered = [];
  for (let i = 0; i < 3; i++)
    metered.push((await request(port, '/api/google/nearby-places')).status);
  assert.deepEqual(metered, [200, 200, 429]);
  const general = [];
  for (let i = 0; i < 4; i++)
    general.push((await request(port, '/api/echo')).status);
  // 2 metered hits already counted toward the general bucket of 5.
  assert.deepEqual(general, [200, 200, 200, 429]);
  const limited = await request(port, '/api/echo');
  assert.ok(Number(limited.headers['retry-after']) >= 1);
  // Static files are never rate limited.
  assert.equal((await request(port, '/')).status, 200);
});

test('rate limiter and client identification units', () => {
  let clock = 0;
  const limiter = createFixedWindowLimiter({ max: 2, now: () => clock });
  assert.equal(limiter.check('a').ok, true);
  assert.equal(limiter.check('a').ok, true);
  assert.equal(limiter.check('a').ok, false);
  assert.equal(limiter.check('b').ok, true);
  clock = 60_000;
  assert.equal(limiter.check('a').ok, true);
  const bounded = createFixedWindowLimiter({ max: 1, maxKeys: 10 });
  for (let i = 0; i < 100; i++) bounded.check(`k${i}`);
  assert.ok(bounded.size <= 10);
  assert.equal(createFixedWindowLimiter({ max: 0 }).check('x').ok, true);

  const req = {
    headers: { 'fly-client-ip': '198.51.100.7', 'x-forwarded-for': '1.2.3.4' },
    socket: { remoteAddress: '10.0.0.1' },
  };
  assert.equal(clientAddress(req, {}), '10.0.0.1');
  assert.equal(
    clientAddress(req, { clientIpHeader: 'fly-client-ip' }),
    '198.51.100.7',
  );
  assert.equal(
    resolveProductionConfig({ FLY_APP_NAME: 'eartheye' }).clientIpHeader,
    'fly-client-ip',
  );
  assert.equal(resolveProductionConfig({}).clientIpHeader, '');
  assert.equal(isMeteredApiPath('/api/openai/hud-summary'), true);
  assert.equal(isMeteredApiPath('/api/realtime/token'), true);
  assert.equal(isMeteredApiPath('/api/realtime/debug-log'), false);
  assert.equal(isMeteredApiPath('/api/opensky'), false);
});

test('API body limits: 413 over the cap, 411 for unsized chunked bodies', async (t) => {
  const { port } = await start(t, { env: { API_MAX_BODY_BYTES: '16' } });
  const big = await request(port, '/api/echo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(64) }),
  });
  assert.equal(big.status, 413);
  const small = await request(port, '/api/echo', {
    method: 'POST',
    body: '{}',
  });
  assert.equal(small.status, 200);
  const chunked = await request(port, '/api/echo', {
    method: 'POST',
    headers: { 'Transfer-Encoding': 'chunked' },
    body: '{}',
  });
  assert.equal(chunked.status, 411);
});

test('host allowlist is off by default; when set it redirects or rejects other hosts', async (t) => {
  const { port: openPort } = await start(t);
  const open = await request(openPort, '/', {
    headers: { Host: 'eartheye.fly.dev' },
  });
  assert.equal(open.status, 200);

  const { port } = await start(t, {
    env: { ALLOWED_HOSTS: 'eartheye.us, www.eartheye.us' },
  });
  const redirected = await request(port, '/some/path?x=1', {
    headers: { Host: 'eartheye.fly.dev' },
  });
  assert.equal(redirected.status, 308);
  assert.equal(
    redirected.headers.location,
    'https://eartheye.us/some/path?x=1',
  );
  const post = await request(port, '/api/echo', {
    method: 'POST',
    headers: { Host: 'eartheye.fly.dev' },
    body: '{}',
  });
  assert.equal(post.status, 421);
  const ok = await request(port, '/', {
    headers: { Host: 'WWW.EarthEye.us:443' },
  });
  assert.equal(ok.status, 200);

  const { port: rejectPort } = await start(t, {
    env: { ALLOWED_HOSTS: 'eartheye.us', ALLOWED_HOSTS_ACTION: 'reject' },
  });
  const rejected = await request(rejectPort, '/', {
    headers: { Host: 'eartheye.fly.dev' },
  });
  assert.equal(rejected.status, 421);
});

test('login is off by default: the server is open and /login redirects home', async (t) => {
  const { port: openPort } = await start(t);
  assert.equal((await request(openPort, '/')).status, 200);
  assert.equal((await request(openPort, '/api/echo')).status, 200);
  assert.equal(resolveProductionConfig({}).login, null);
  const login = await request(openPort, '/login');
  assert.equal(login.status, 302);
  assert.equal(login.headers.location, '/');
  // Sign-in behaviour is covered in productionAuth.test.mjs.
});

test('optional origin secret header gates everything except healthz', async (t) => {
  const { port } = await start(t, {
    env: { ORIGIN_AUTH_HEADER: 'X-Origin-Auth', ORIGIN_AUTH_SECRET: 'abc123' },
  });
  assert.equal((await request(port, '/')).status, 403);
  assert.equal(
    (await request(port, '/', { headers: { 'X-Origin-Auth': 'wrong' } }))
      .status,
    403,
  );
  assert.equal(
    (await request(port, '/', { headers: { 'X-Origin-Auth': 'abc123' } }))
      .status,
    200,
  );
  assert.equal((await request(port, '/healthz')).status, 200);
});

test('Realtime debug sink discards on a public host unless enabled; upgrades are refused', async (t) => {
  let hits = 0;
  const plugin = {
    configurePreviewServer(server) {
      server.middlewares.use('/api/realtime/debug-log', (_req, res) => {
        hits++;
        res.statusCode = 204;
        res.end();
      });
    },
  };
  const { port } = await start(t, { plugins: [plugin] });
  const res = await request(port, '/api/realtime/debug-log', {
    method: 'POST',
    body: '{}',
  });
  assert.equal(res.status, 204);
  assert.equal(hits, 0);

  const reply = await new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(
        'GET /api/ais-live HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n',
      );
    });
    let data = '';
    socket.on('data', (chunk) => (data += chunk));
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
  assert.match(reply, /^HTTP\/1\.1 404/);
});

test('graceful close drains, emits close for provider teardown, and healthz reports draining', async (t) => {
  const distDir = await makeDist(t);
  let disposed = 0;
  const plugin = {
    configurePreviewServer(server) {
      server.httpServer.on('close', () => disposed++);
    },
  };
  const app = await createProductionApp({
    distDir,
    env: {},
    plugins: [plugin],
  });
  await app.listen(0, '127.0.0.1');
  await app.close();
  assert.equal(disposed, 1);
  assert.equal(app.server.listening, false);
});

test('configuration defaults: port 8080 on 0.0.0.0; misconfiguration fails loudly', () => {
  const config = resolveProductionConfig({});
  assert.equal(config.port, 8080);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.allowedHosts.length, 0);
  assert.equal(config.originAuth, null);
  assert.equal(config.realtimeDebugLog, false);
  assert.throws(() => resolveProductionConfig({ PORT: 'abc' }), /PORT/);
  assert.throws(
    () => resolveProductionConfig({ ALLOWED_HOSTS_ACTION: 'teleport' }),
    /ALLOWED_HOSTS_ACTION/,
  );
});

test('missing build output refuses to start', async () => {
  await assert.rejects(
    createProductionApp({ distDir: '/nonexistent-dist', env: {}, plugins: [] }),
    /npm run build/,
  );
});

test('dotenv ladder: later files win, real environment wins over files', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'eartheye-env-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, '.env'), 'A=base\nB=base\nC=base\n');
  await writeFile(path.join(dir, '.env.production'), 'B=prod\n');
  const env = { C: 'real' };
  const loaded = loadDotenvLadder(dir, 'production', env);
  assert.deepEqual(loaded, ['.env', '.env.production']);
  assert.deepEqual(env, { A: 'base', B: 'prod', C: 'real' });
});

test('middleware stack restores req.url across next() like Connect', async () => {
  const stack = createMiddlewareStack();
  const seen = [];
  stack.use('/api/x', (req, _res, next) => {
    seen.push(req.url);
    next();
  });
  stack.use('/api', (req) => seen.push(req.url));
  const req = { url: '/api/x/y?z' };
  stack.handle(req, {}, () => seen.push('done'));
  assert.deepEqual(seen, ['/y?z', '/x/y?z']);
});

test('the production start path never imports Vite', async () => {
  const seen = new Set();
  const external = new Set();
  async function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const { imports } = analyzeModule(await readFile(file, 'utf8'));
    for (const specifier of imports) {
      if (specifier.startsWith('.')) {
        const target = path.resolve(
          path.dirname(file),
          specifier.split('?')[0],
        );
        if (existsSync(target)) await visit(target);
      } else external.add(specifier.replace(/^node:.*/, 'node:'));
    }
  }
  await visit(path.join(repoRoot, 'server/prod.mjs'));
  assert.ok(seen.size > 50, `walked ${seen.size} modules`);
  for (const specifier of external)
    assert.doesNotMatch(
      specifier,
      /^vite(?:$|\/|-plugin)/,
      `${specifier} on the production path`,
    );
  assert.equal(
    [...seen].some((file) => /vite\.config|build[\\/]vite\.js/.test(file)),
    false,
  );
});

test('API: radio is excluded by policy (403) and /api/atlas/policy reports commercial-safe mode', async (t) => {
  const distDir = await makeDist(t);
  const app = await createProductionApp({ distDir, env: {} });
  const { port } = await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  for (const p of [
    '/api/radio',
    '/api/radio/stations?q=x',
    '/api/radio/stream',
  ]) {
    const res = await request(port, p);
    assert.equal(res.status, 403, p);
    assert.equal(JSON.parse(res.text()).code, 'excluded-by-policy');
  }
  const before = process.env.EE_COMMERCIAL_SAFE;
  t.after(() => {
    if (before === undefined) delete process.env.EE_COMMERCIAL_SAFE;
    else process.env.EE_COMMERCIAL_SAFE = before;
  });
  delete process.env.EE_COMMERCIAL_SAFE;
  let res = await request(port, '/api/atlas/policy');
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.text()).commercialSafe, false);
  process.env.EE_COMMERCIAL_SAFE = '1';
  res = await request(port, '/api/atlas/policy');
  const body = JSON.parse(res.text());
  assert.equal(body.commercialSafe, true);
  assert.ok(body.restrictedServices.includes('opensky'));
});
