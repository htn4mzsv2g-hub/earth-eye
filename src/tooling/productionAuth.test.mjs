import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProductionApp } from '../../server/production/app.js';
import { resolveProductionConfig } from '../../server/production/policy.js';
import {
  SESSION_TTL_MS,
  SESSION_BROWSER_TTL_MS,
  cleanEnvSecret,
  createLoginLimiter,
  createSessionAuth,
  parseCookies,
  resolveLoginConfig,
  resolveReviewerConfig,
  safeNextPath,
  sessionCookie,
} from '../../server/production/session-auth.js';
import { renderLoginPage, MESSAGES } from '../../server/production/login-page.js';
import {
  PRIVATE_BETA_CLOSED,
  OWNER_ROLE,
  REVIEWER_ROLE,
  createAccountAuthority,
  createClosedRegistration,
  createCompositeUserStore,
  createEnvAdminStore,
  createEnvReviewerStore,
} from '../../server/production/users.js';
import { resolveAuthProviders } from '../../server/production/auth-providers.js';

const USER = 'testuser';
const PASS = 'test-pass-123';
const SECRET = 'x'.repeat(48);
const INDEX_HTML =
  '<!doctype html><html><head><title>Earth Eye app</title></head><body>app</body></html>';
const WORDMARK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 1"><title>Earth Eye</title><style>.a{fill:#fff}</style><rect class="a" width="10" height="1"/></svg>';

async function makeDist(t) {
  const parent = await mkdtemp(path.join(tmpdir(), 'eartheye-auth-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const dir = path.join(parent, 'dist');
  await mkdir(path.join(dir, 'assets'), { recursive: true });
  await mkdir(path.join(dir, 'brand'));
  await writeFile(path.join(dir, 'index.html'), INDEX_HTML);
  await writeFile(path.join(dir, 'assets', 'index-AbCd1234.js'), 'export {}');
  await writeFile(path.join(dir, 'manifest.webmanifest'), '{}');
  await writeFile(path.join(dir, 'favicon.svg'), '<svg/>');
  await writeFile(
    path.join(dir, 'brand', 'eartheye-wordmark-animated.svg'),
    WORDMARK,
  );
  return dir;
}

function cctvPlugin() {
  return {
    configurePreviewServer(server) {
      server.middlewares.use('/api/cctv/sources', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end('{"sources":[]}');
      });
    },
  };
}

async function start(t, env = {}, { now } = {}) {
  const distDir = await makeDist(t);
  const app = await createProductionApp({
    distDir,
    env: { LOGIN_USER: USER, LOGIN_PASS: PASS, SESSION_SECRET: SECRET, ...env },
    plugins: [cctvPlugin()],
    ...(now ? { now } : {}),
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

const HTML = { Accept: 'text/html,application/xhtml+xml' };

function postLogin(port, fields, headers = {}) {
  return request(port, '/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: `http://127.0.0.1:${port}`,
      Host: `127.0.0.1:${port}`,
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function cookieFrom(res) {
  const header = [].concat(res.headers['set-cookie'] || [])[0] || '';
  return header.split(';')[0];
}

function assertNoBasicChallenge(res) {
  assert.equal(res.headers['www-authenticate'], undefined);
}

test('unauthenticated HTML navigation is redirected to the Earth Eye sign-in page', async (t) => {
  const { port } = await start(t);
  const root = await request(port, '/', { headers: HTML });
  assert.equal(root.status, 302);
  assert.equal(root.headers.location, '/login');
  assertNoBasicChallenge(root);
  assert.doesNotMatch(root.text, /Earth Eye app/);

  const deep = await request(port, '/some/view?x=1', {
    headers: { 'Sec-Fetch-Mode': 'navigate' },
  });
  assert.equal(deep.status, 302);
  assert.equal(deep.headers.location, '/login?next=%2Fsome%2Fview%3Fx%3D1');

  const page = await request(port, '/login', { headers: HTML });
  assert.equal(page.status, 200);
  assertNoBasicChallenge(page);
  assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.match(page.text, /<form[^>]+method="post" action="\/login"/);
  assert.match(page.text, /<label for="username">Email or username<\/label>/);
  assert.match(page.text, /autocomplete="username"/);
  assert.match(page.text, /autocapitalize="none"/);
  assert.match(page.text, /type="password" autocomplete="current-password"/);
  assert.match(
    page.text,
    /<button type="submit" class="primary">Sign In<\/button>/,
  );
  assert.match(page.text, /Sign in to Earth Eye/);
  // Sign In / Create Account tabs (plain links, no JS needed).
  assert.match(
    page.text,
    /<a class="tab" href="\/login" aria-current="page">Sign In<\/a>/,
  );
  assert.match(page.text, /<a class="tab" href="\/signup">Create Account<\/a>/);
  // Show/Hide toggle: accessible, starts pressed=false, hidden until the script runs.
  assert.match(
    page.text,
    /<button type="button" class="pw-toggle" data-pw-toggle="password" aria-controls="password" aria-pressed="false" aria-label="Show password" hidden>/,
  );
  assert.match(
    page.text,
    /<footer><a href="\/terms">Terms<\/a><a href="\/privacy">Privacy<\/a><\/footer>/,
  );
  assert.match(page.text, /viewport-fit=cover/);
  assert.match(page.text, /font-size:17px/);
  assert.doesNotMatch(page.text, /<script src/i);
  assert.doesNotMatch(page.text, /assets\/index-/);
  assert.doesNotMatch(page.text, new RegExp(PASS));
  // Strict CSP: the only style source is this response's nonce, used by the page and the wordmark.
  const csp = page.headers['content-security-policy'];
  const nonce = /style-src 'nonce-([^']+)'/.exec(csp)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'self'/);
  const styles = page.text.match(/<style[^>]*>/g);
  assert.equal(styles.length, 2);
  for (const tag of styles) assert.equal(tag, `<style nonce="${nonce}">`);
  assert.ok(csp.includes(`script-src 'nonce-${nonce}'`));
  assert.deepEqual(page.text.match(/<script[^>]*>/g), [
    `<script nonce="${nonce}">`,
  ]);
  assert.match(page.text, /<svg class="wordmark"/);
  assert.equal(page.headers['x-frame-options'], 'DENY');
});

test('API, assets, manifest and websockets get 401 JSON without WWW-Authenticate', async (t) => {
  const { port } = await start(t);
  for (const url of [
    '/api/cctv/sources',
    '/api/anything',
    '/assets/index-AbCd1234.js',
    '/manifest.webmanifest',
    '/index.html',
  ]) {
    const res = await request(port, url, { headers: { Accept: '*/*' } });
    assert.equal(res.status, 401, url);
    assertNoBasicChallenge(res);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.equal(JSON.parse(res.text).error, 'Authentication required');
    assert.doesNotMatch(res.text, /Earth Eye app|export/);
  }
  const api = await request(port, '/api/cctv/sources', { headers: HTML });
  assert.equal(api.status, 401, 'API never redirects, even for HTML accept');
  const post = await request(port, '/api/cctv/sources', {
    method: 'POST',
    body: '{}',
  });
  assert.equal(post.status, 401);
  // Only the brand icons and health check are open.
  assert.equal((await request(port, '/favicon.svg')).status, 200);
  assert.equal((await request(port, '/healthz')).status, 200);

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
  assert.match(reply, /^HTTP\/1\.1 401/);
  assert.doesNotMatch(reply, /www-authenticate/i);
});

test('wrong password shows the error; correct login sets the cookie and grants access', async (t) => {
  const { port } = await start(t);
  const wrong = await postLogin(port, {
    username: USER,
    password: 'nope',
    next: '/',
  });
  assert.equal(wrong.status, 200);
  assertNoBasicChallenge(wrong);
  assert.match(wrong.text, /Invalid credentials\./);
  assert.match(wrong.text, /role="alert"/);
  assert.match(wrong.text, new RegExp(`value="${USER}"`), 'username kept');
  assert.doesNotMatch(wrong.text, /value="nope"/, 'password never echoed');
  assert.equal(wrong.headers['set-cookie'], undefined);

  const wrongUser = await postLogin(port, {
    username: 'nobody',
    password: PASS,
  });
  const errorBlock = (text) =>
    /<p class="msg msg-error" role="alert">([^<]*)<\/p>/.exec(text)[1];
  assert.equal(
    errorBlock(wrongUser.text),
    'Invalid credentials.',
    'wrong username',
  );
  assert.equal(
    errorBlock(wrong.text),
    'Invalid credentials.',
    'wrong password',
  );
  const wrongCase = await postLogin(port, {
    username: 'TestUser',
    password: PASS,
  });
  assert.match(
    wrongCase.text,
    /Invalid credentials/,
    'username is compared exactly',
  );
  assert.equal(wrongCase.headers['set-cookie'], undefined);
  const padded = await postLogin(port, {
    username: USER,
    password: `${PASS} `,
  });
  assert.equal(
    padded.headers['set-cookie'],
    undefined,
    'user input is never trimmed',
  );

  const ok = await postLogin(port, {
    username: USER,
    password: PASS,
    next: '/',
    remember: '1',
  });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.location, '/');
  const setCookie = ok.headers['set-cookie'][0];
  assert.match(setCookie, /^ee_session=v1\./);
  assert.match(setCookie, /; Path=\//);
  assert.match(setCookie, /; HttpOnly/);
  assert.match(setCookie, /; SameSite=Lax/);
  assert.match(setCookie, /; Max-Age=2592000/);
  assert.doesNotMatch(setCookie, /Secure/, 'plain-http local run');
  assert.doesNotMatch(setCookie, new RegExp(PASS));
  const cookie = cookieFrom(ok);

  const home = await request(port, '/', {
    headers: { ...HTML, Cookie: cookie },
  });
  assert.equal(home.status, 200);
  assert.match(home.text, /Earth Eye app/);
  const api = await request(port, '/api/cctv/sources', {
    headers: { Cookie: cookie },
  });
  assert.equal(api.status, 200);
  assert.deepEqual(JSON.parse(api.text), { sources: [] });
  const asset = await request(port, '/assets/index-AbCd1234.js', {
    headers: { Cookie: cookie },
  });
  assert.equal(asset.status, 200);
  assert.equal(
    asset.headers['cache-control'],
    'private, max-age=31536000, immutable',
  );
  // Already signed in: /login goes straight on.
  const again = await request(port, '/login?next=%2Fx', {
    headers: { Cookie: cookie },
  });
  assert.equal(again.status, 302);
  assert.equal(again.headers.location, '/x');
  // A tampered cookie is rejected.
  const tampered = `${cookie.slice(0, -2)}${cookie.endsWith('AA') ? 'BB' : 'AA'}`;
  assert.equal(
    (
      await request(port, '/api/cctv/sources', {
        headers: { Cookie: tampered },
      })
    ).status,
    401,
  );
});

test('Secure cookie behind an HTTPS proxy; sessions survive a restart with SESSION_SECRET', async (t) => {
  const { port } = await start(t, { TRUST_PROXY: '1' });
  const ok = await postLogin(
    port,
    { username: USER, password: PASS },
    { 'X-Forwarded-Proto': 'https' },
  );
  assert.match(ok.headers['set-cookie'][0], /; Secure/);
  const cookie = cookieFrom(ok);
  const { port: restarted } = await start(t, { TRUST_PROXY: '1' });
  assert.equal(
    (
      await request(restarted, '/api/cctv/sources', {
        headers: { Cookie: cookie },
      })
    ).status,
    200,
  );
  const { port: newPassword } = await start(t, {
    LOGIN_PASS: 'rotated-pass-456',
  });
  assert.equal(
    (
      await request(newPassword, '/api/cctv/sources', {
        headers: { Cookie: cookie },
      })
    ).status,
    401,
    'changing the password invalidates old sessions',
  );
  const { port: noSecret } = await start(t, { SESSION_SECRET: '' });
  assert.equal(
    (
      await request(noSecret, '/api/cctv/sources', {
        headers: { Cookie: cookie },
      })
    ).status,
    401,
  );
});

test('trailing newline in env credentials still signs in; legacy BASIC_AUTH_* names work', async (t) => {
  const { port } = await start(t, {
    LOGIN_USER: `${USER}\n`,
    LOGIN_PASS: `${PASS}\r\n`,
    SESSION_SECRET: `${SECRET}\n`,
  });
  const ok = await postLogin(port, { username: USER, password: PASS });
  assert.equal(ok.status, 303);
  assert.equal(cleanEnvSecret(' a b \n\t'), ' a b');

  const { port: legacy } = await start(t, {
    LOGIN_USER: '',
    LOGIN_PASS: '',
    BASIC_AUTH_USER: 'Legacy2',
    BASIC_AUTH_PASS: 'legacy:pass\n',
  });
  assert.equal(
    (await postLogin(legacy, { username: 'Legacy2', password: 'legacy:pass' }))
      .status,
    303,
  );
  assert.equal(
    resolveLoginConfig({
      LOGIN_USER: 'a',
      LOGIN_PASS: 'b',
      BASIC_AUTH_USER: 'c',
      BASIC_AUTH_PASS: 'd',
    }).user,
    'a',
  );
  assert.throws(
    () => resolveProductionConfig({ LOGIN_USER: 'only' }),
    /must be set together/,
  );
  assert.throws(
    () => resolveProductionConfig({ BASIC_AUTH_USER: 'only' }),
    /must be set together/,
  );
  assert.throws(
    () =>
      resolveLoginConfig({
        LOGIN_USER: 'a',
        LOGIN_PASS: 'b',
        SESSION_SECRET: 'short',
      }),
    /SESSION_SECRET/,
  );
  assert.equal(resolveLoginConfig({}), null);
});

test('logout clears the cookie and revokes the session', async (t) => {
  const { port } = await start(t);
  const cookie = cookieFrom(
    await postLogin(port, { username: USER, password: PASS }),
  );
  const confirm = await request(port, '/logout', {
    headers: { Cookie: cookie },
  });
  assert.equal(confirm.status, 200);
  assert.match(confirm.text, /action="\/logout"/);
  assert.match(confirm.text, />Log Out<\/button>/);
  const out = await request(port, '/logout', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: `http://127.0.0.1:${port}`,
      Host: `127.0.0.1:${port}`,
    },
  });
  assert.equal(out.status, 303);
  assert.equal(out.headers.location, '/login?signedout=1');
  assert.match(
    out.headers['set-cookie'][0],
    /^ee_session=; Path=\/; Max-Age=0/,
  );
  assert.equal(
    (await request(port, '/api/cctv/sources', { headers: { Cookie: cookie } }))
      .status,
    401,
  );
  const notice = await request(port, '/login?signedout=1');
  assert.match(notice.text, /You have been signed out\./);
  const crossSite = await request(port, '/logout', {
    method: 'POST',
    headers: { Origin: 'https://evil.example', Host: `127.0.0.1:${port}` },
  });
  assert.equal(crossSite.status, 403);
});

test('open redirects are blocked; cross-site login POSTs are refused', async (t) => {
  for (const [input, expected] of [
    ['/cctv?x=1#y', '/cctv?x=1#y'],
    ['https://evil.example/', '/'],
    ['//evil.example/', '/'],
    ['/\\evil.example', '/'],
    ['\\\\evil.example', '/'],
    ['/%2F%2Fevil.example', '/%2F%2Fevil.example'],
    ['javascript:alert(1)', '/'],
    ['/login', '/'],
    ['/logout?x', '/'],
    ['/ok\nSet-Cookie: x', '/'],
    ['', '/'],
    [null, '/'],
  ])
    assert.equal(safeNextPath(input), expected, String(input));

  const { port } = await start(t);
  for (const next of [
    'https://evil.example/',
    '//evil.example/x',
    '/\\evil.example',
  ]) {
    const res = await postLogin(port, { username: USER, password: PASS, next });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, '/', next);
  }
  const deep = await postLogin(port, {
    username: USER,
    password: PASS,
    next: '/cctv?city=sf',
  });
  assert.equal(deep.headers.location, '/cctv?city=sf');
  const page = await request(port, '/login?next=https%3A%2F%2Fevil.example');
  assert.match(page.text, /name="next" value="\/"/);

  const csrf = await postLogin(
    port,
    { username: USER, password: PASS },
    { Origin: 'https://evil.example' },
  );
  assert.equal(csrf.status, 403);
  assert.equal(csrf.headers['set-cookie'], undefined);
  const badReferer = await postLogin(
    port,
    { username: USER, password: PASS },
    { Origin: undefined, Referer: 'https://evil.example/login' },
  );
  assert.equal(badReferer.status, 403);
  const goodReferer = await postLogin(
    port,
    { username: USER, password: PASS },
    { Origin: undefined, Referer: `http://127.0.0.1:${port}/login` },
  );
  assert.equal(goodReferer.status, 303);
});

test('sign-in attempts are rate limited per IP with a friendly message', async (t) => {
  let clock = 1_000_000;
  const { port } = await start(t, {}, { now: () => clock });
  for (let i = 0; i < 10; i++) {
    const res = await postLogin(port, { username: USER, password: `bad-${i}` });
    assert.match(res.text, /Invalid credentials/);
  }
  const blocked = await postLogin(port, { username: USER, password: PASS });
  assert.equal(blocked.status, 429);
  assertNoBasicChallenge(blocked);
  assert.match(
    blocked.text,
    /Too many sign-in attempts\. Please wait 15 minutes and try again\./,
  );
  assert.equal(blocked.headers['retry-after'], '900');
  assert.equal(blocked.headers['set-cookie'], undefined);
  clock += 15 * 60 * 1000;
  assert.equal(
    (await postLogin(port, { username: USER, password: PASS })).status,
    303,
  );

  const limiter = createLoginLimiter({ max: 2, now: () => clock });
  limiter.fail('a');
  limiter.succeed('a');
  limiter.fail('a');
  assert.equal(limiter.check('a').ok, true, 'success resets the counter');
  limiter.fail('a');
  assert.equal(limiter.check('a').ok, false);
  assert.equal(limiter.check('b').ok, true);
});

test('session tokens: signed, expiring, sliding re-issue, password-versioned', async (t) => {
  let clock = 5_000_000;
  const now = () => clock;
  const store = createEnvAdminStore({ user: USER, pass: PASS });
  const auth = createSessionAuth({ secret: SECRET, userStore: store, now });
  const admin = store.authenticate(USER, PASS);
  assert.deepEqual(admin, {
    id: 'admin',
    displayName: 'Owner',
    role: 'owner',
  });
  const { token } = auth.issue(admin);
  assert.equal(token.split('.').length, 7);
  assert.equal(auth.verify(token).sub, 'admin');
  assert.equal(auth.shouldReissue(auth.verify(token)), false);
  clock += 25 * 60 * 60 * 1000;
  assert.equal(auth.shouldReissue(auth.verify(token)), true);
  clock += SESSION_TTL_MS;
  assert.equal(auth.verify(token), null, 'expired');
  assert.equal(auth.verify('v1.garbage'), null);
  assert.equal(auth.verify(''), null);
  const otherStore = createEnvAdminStore({ user: 'someone', pass: PASS });
  const other = createSessionAuth({
    secret: SECRET,
    userStore: otherStore,
    now,
  });
  assert.equal(other.verify(auth.issue(admin).token), null);
  assert.throws(() => auth.issue({ id: 'ghost' }), /Unknown account/);
  assert.equal(store.authenticate(USER, `${PASS}x`), null);
  assert.equal(store.authenticate('nobody', PASS), null);
  assert.equal(store.authenticate(undefined, undefined), null);
  assert.equal(createClosedRegistration().open, false);
  assert.deepEqual(createClosedRegistration().register({ email: 'a@b.c' }), {
    ok: false,
    message: 'Private beta is currently closed.',
  });
  assert.deepEqual(
    [...parseCookies('a=1; ee_session=abc; a=2')],
    [
      ['a', '1'],
      ['ee_session', 'abc'],
    ],
  );

  // The rendered page escapes echoed input and never includes script.
  const page = renderLoginPage({
    wordmarkSvg: null,
    username: '"><script>x</script>',
    error: 'Invalid credentials.',
  });
  assert.doesNotMatch(page.html, /<script>/);
  assert.match(page.html, /&quot;&gt;&lt;script&gt;/);
  assert.match(page.html, /EARTH EYE/);
});

test('HEAD, unsupported methods and oversized sign-in bodies', async (t) => {
  const { port } = await start(t);
  const head = await request(port, '/login', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.text, '');
  assert.equal(
    (await request(port, '/login', { method: 'PUT', body: 'x' })).status,
    405,
  );
  const big = await postLogin(port, {
    username: USER,
    password: 'x'.repeat(20_000),
  });
  assert.equal(big.status, 400);
  const json = await request(port, '/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `http://127.0.0.1:${port}`,
      Host: `127.0.0.1:${port}`,
    },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  assert.equal(json.status, 400);
});

test('Create Account is visible but closed: exact message, nothing stored, no account', async (t) => {
  const { port } = await start(t);
  const tab = await request(port, '/signup', { headers: HTML });
  assert.equal(tab.status, 200);
  assert.match(
    tab.text,
    /<a class="tab" href="\/signup" aria-current="page">Create Account<\/a>/,
  );
  assert.match(tab.text, /autocomplete="name"/);
  assert.match(tab.text, /type="email" autocomplete="email"/);
  assert.match(tab.text, /autocomplete="new-password"/);
  assert.match(tab.text, /data-pw-toggle="new-password"/);
  const form = await request(port, '/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: `http://127.0.0.1:${port}`,
    },
    body: new URLSearchParams({
      name: 'Eve',
      email: 'eve@example.com',
      password: 'hunter22',
    }).toString(),
  });
  assert.equal(form.status, 403);
  assertNoBasicChallenge(form);
  assert.equal(form.headers['set-cookie'], undefined);
  assert.match(
    form.text,
    /<p class="msg msg-error" role="alert">Private beta is currently closed\.<\/p>/,
  );
  assert.doesNotMatch(
    form.text,
    /eve@example\.com|hunter22|"Eve"/,
    'submitted fields are not echoed',
  );
  const api = await request(port, '/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'x@y.z', password: 'p' }),
  });
  assert.equal(api.status, 403);
  assert.deepEqual(JSON.parse(api.text), { error: PRIVATE_BETA_CLOSED });
  // The submitted "account" cannot sign in.
  const attempt = await postLogin(port, {
    username: 'eve@example.com',
    password: 'hunter22',
  });
  assert.match(attempt.text, /Invalid credentials\./);
  assert.equal(attempt.headers['set-cookie'], undefined);
});

test('Terms and Privacy are honest placeholders, public without a session', async (t) => {
  const { port } = await start(t);
  const terms = await request(port, '/terms', { headers: HTML });
  assert.equal(terms.status, 200);
  assert.match(terms.text, /private beta/i);
  assert.match(terms.text, /not published yet/i);
  assert.match(terms.headers['content-security-policy'], /default-src 'none'/);
  const privacy = await request(port, '/privacy', { headers: HTML });
  assert.equal(privacy.status, 200);
  assert.match(privacy.text, /private beta/i);
  assert.match(privacy.text, /not published yet/i);
  assert.doesNotMatch(privacy.text, /<script/, 'no password field, no script');
  assert.doesNotMatch(privacy.text, /LOGIN_PASS|SESSION_SECRET|APPLE_CLIENT/);
  assert.equal(
    (await request(port, '/terms', { method: 'POST', body: '' })).status,
    405,
  );
});

test('/api/session tells the app whether to show Log Out', async (t) => {
  const { port } = await start(t);
  assert.equal((await request(port, '/api/session')).status, 401);
  const cookie = cookieFrom(
    await postLogin(port, { username: USER, password: PASS }),
  );
  const signedIn = await request(port, '/api/session', {
    headers: { Cookie: cookie },
  });
  assert.deepEqual(JSON.parse(signedIn.text), {
    authEnabled: true,
    authenticated: true,
    role: 'owner',
    userId: 'admin',
  });
  assert.doesNotMatch(signedIn.text, new RegExp(USER));
  const { port: open } = await start(t, { LOGIN_USER: '', LOGIN_PASS: '' });
  assert.deepEqual(JSON.parse((await request(open, '/api/session')).text), {
    authEnabled: false,
    authenticated: false,
    role: null,
    userId: null,
  });
});

test('AUTH-1/2: Remember me sets Max-Age; unchecked is a session cookie', async (t) => {
  const { port } = await start(t);
  const remembered = await postLogin(port, {
    username: USER,
    password: PASS,
    remember: '1',
  });
  assert.match(remembered.headers['set-cookie'][0], /; Max-Age=2592000/);
  const ephemeral = await postLogin(port, {
    username: USER,
    password: PASS,
  });
  assert.doesNotMatch(
    ephemeral.headers['set-cookie'][0],
    /Max-Age=/,
    'no Max-Age when Remember me is off',
  );
  assert.match(ephemeral.headers['set-cookie'][0], /^ee_session=v1\./);
  assert.equal(sessionCookie('tok', { secure: false, remember: false }).includes('Max-Age'), false);
  assert.match(sessionCookie('tok', { secure: true, remember: true }), /Max-Age=2592000/);
  assert.match(sessionCookie('tok', { secure: true, remember: true }), /Secure/);
});

test('AUTH-2: polished sign-in has Remember me, Forgot link, gated Apple/Google', async (t) => {
  const { port } = await start(t);
  const page = await request(port, '/login', { headers: HTML });
  assert.equal(page.status, 200);
  assert.match(page.text, /name="remember" value="1"/);
  assert.match(page.text, /Remember me/);
  assert.match(page.text, /href="\/forgot"/);
  assert.match(page.text, /Forgot password\?/);
  // EE-LIVE-2 Phase 4: no developer/setup/env leakage on the public card.
  assert.match(page.text, /CURRENTLY UNAVAILABLE/);
  assert.match(page.text, /data-provider="apple"/);
  assert.match(page.text, /data-provider="google"/);
  assert.doesNotMatch(page.text, /CONFIGURATION REQUIRED/);
  assert.doesNotMatch(page.text, /What to configure/);
  assert.doesNotMatch(page.text, /APPLE_CLIENT_ID/);
  assert.doesNotMatch(page.text, /GOOGLE_OAUTH_CLIENT/);
  assert.doesNotMatch(page.text, /auth\/apple\/callback/);
  assert.doesNotMatch(page.text, /auth\/google\/callback/);
  assert.doesNotMatch(page.text, /Missing: APPLE_CLIENT_ID/);
});

test('AUTH-2: Forgot password is honest when email is not configured', async (t) => {
  const { port } = await start(t);
  const page = await request(port, '/forgot', { headers: HTML });
  assert.equal(page.status, 200);
  assert.match(page.text, /Password reset is not available yet/);
  assert.doesNotMatch(page.text, /LOGIN_PASS/);
  assert.doesNotMatch(page.text, /EMAIL_FROM/);
  assert.doesNotMatch(page.text, /SMTP_URL/);
  const post = await request(port, '/forgot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: `http://127.0.0.1:${port}`,
    },
    body: 'email=owner@example.com',
  });
  assert.equal(post.status, 503);
  assert.match(post.text, /Password reset is not available yet/);
});

test('AUTH-1: account authority keeps env owner; providers detect missing secrets', () => {
  const store = createEnvAdminStore({ user: USER, pass: PASS });
  const accounts = createAccountAuthority({ userStore: store });
  assert.equal(accounts.registration.open, false);
  assert.equal(accounts.authenticate(USER, PASS).role, 'owner');
  const providers = resolveAuthProviders({});
  assert.equal(providers.apple.configured, false);
  assert.equal(providers.google.configured, false);
  assert.equal(providers.email.configured, false);
  assert.ok(providers.apple.missing.includes('APPLE_CLIENT_ID'));
  assert.ok(providers.google.missing.includes('GOOGLE_OAUTH_CLIENT_ID'));
  const ready = resolveAuthProviders({
    APPLE_CLIENT_ID: 'id',
    APPLE_TEAM_ID: 'team',
    APPLE_KEY_ID: 'key',
    APPLE_PRIVATE_KEY: 'pem',
    GOOGLE_OAUTH_CLIENT_ID: 'gid',
    GOOGLE_OAUTH_CLIENT_SECRET: 'gsec',
    EMAIL_FROM: 'noreply@eartheye.us',
    EMAIL_API_KEY: 'rk_test',
  });
  assert.equal(ready.apple.configured, true);
  assert.equal(ready.google.configured, true);
  assert.equal(ready.email.configured, true);
  assert.ok(SESSION_BROWSER_TTL_MS < SESSION_TTL_MS);
  assert.equal(MESSAGES.forgotUnavailable.includes('not configured'), true);
});

test('AUTH-2: Create Account stays closed and fields are not enableable via POST', async (t) => {
  const { port } = await start(t);
  const tab = await request(port, '/signup', { headers: HTML });
  assert.match(tab.text, /Private beta is currently closed/);
  assert.match(tab.text, /CURRENTLY UNAVAILABLE/);
  assert.doesNotMatch(tab.text, /CONFIGURATION REQUIRED/);
  assert.doesNotMatch(tab.text, /APPLE_CLIENT_ID/);
  const form = await request(port, '/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: `http://127.0.0.1:${port}`,
    },
    body: new URLSearchParams({
      name: 'Eve',
      email: 'eve@example.com',
      password: 'hunter22',
    }).toString(),
  });
  assert.equal(form.status, 403);
  assert.equal(form.headers['set-cookie'], undefined);
});

import { mkdtempSync } from 'node:fs';
import {
  generateTotpCode,
  generateTotpSecret,
  verifyTotp,
  hashRecoveryCode,
  matchRecoveryCode,
  generateRecoveryCodes,
} from '../../server/production/totp.js';
import {
  createMfaStore,
  encryptSecret,
  decryptSecret,
} from '../../server/production/mfa-store.js';
import { createTrustAuth, hashDeviceId } from '../../server/production/trust-device.js';
import {
  createMfaPendingAuth,
  MFA_COOKIE,
} from '../../server/production/session-auth.js';

test('AUTH-5: TOTP generate/verify and recovery hashes', () => {
  const secret = generateTotpSecret();
  assert.ok(secret.length >= 16);
  const code = generateTotpCode(secret);
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotp(secret, code), true);
  assert.equal(verifyTotp(secret, '000000'), false);
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  const hashes = codes.map(hashRecoveryCode);
  assert.equal(matchRecoveryCode(codes[3], hashes), 3);
  assert.equal(matchRecoveryCode('nope-nope', hashes), -1);
  const enc = encryptSecret(secret, SECRET);
  assert.equal(decryptSecret(enc, SECRET), secret);
});

test('AUTH-5: MFA optional — password login still issues session when 2FA off', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ee-mfa-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { port } = await start(t, { EE_AUTH_DATA_DIR: dir });
  const page = await request(port, '/login', { headers: HTML });
  assert.match(page.text, /CURRENTLY UNAVAILABLE/);
  assert.doesNotMatch(page.text, /CONFIGURATION REQUIRED/);
  assert.doesNotMatch(page.text, /Missing: APPLE_CLIENT_ID/);
  assert.doesNotMatch(page.text, /APPLE_CLIENT_ID/);
  const ok = await postLogin(port, {
    username: USER,
    password: PASS,
    remember: '1',
  });
  assert.equal(ok.status, 303);
  assert.match(ok.headers['set-cookie'].join(';'), /ee_session=/);
  assert.doesNotMatch(ok.headers.location || '', /2fa/);
});

test('AUTH-5: enroll requires verify; login then needs 2FA; recovery works', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ee-mfa-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { port } = await start(t, { EE_AUTH_DATA_DIR: dir });
  const login = await postLogin(port, {
    username: USER,
    password: PASS,
    remember: '1',
  });
  const cookie = cookieFrom(login);
  const startEnroll = await request(port, '/account/2fa/start', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: `http://127.0.0.1:${port}`,
      Host: `127.0.0.1:${port}`,
    },
  });
  assert.equal(startEnroll.status, 200);
  assert.match(startEnroll.text, /Set up authenticator/);
  assert.match(startEnroll.text, /Manual key/);
  const secret = /<code class="secret">([A-Z2-7]+)<\/code>/.exec(
    startEnroll.text,
  )[1];
  const bad = await request(port, '/account/2fa/confirm', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: `http://127.0.0.1:${port}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'code=000000',
  });
  assert.match(bad.text, /Invalid authenticator code/);
  const goodCode = generateTotpCode(secret);
  const confirm = await request(port, '/account/2fa/confirm', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: `http://127.0.0.1:${port}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `code=${goodCode}`,
  });
  assert.match(confirm.text, /Recovery codes/);
  const recovery = [...confirm.text.matchAll(/<code>([a-f0-9]{4}-[a-f0-9]{4})<\/code>/g)].map(
    (m) => m[1],
  );
  assert.equal(recovery.length, 10);

  // New login must challenge 2FA (no session until verified).
  const again = await postLogin(port, {
    username: USER,
    password: PASS,
    remember: '1',
  });
  assert.equal(again.status, 303);
  assert.equal(again.headers.location, '/login/2fa');
  const set = [].concat(again.headers['set-cookie'] || []).join('\n');
  assert.match(set, /ee_mfa=/);
  const mfaCookieVal = /ee_mfa=([^;]+)/.exec(set)[1];
  const challenge = await request(port, '/login/2fa', {
    headers: { ...HTML, Cookie: `ee_mfa=${mfaCookieVal}` },
  });
  assert.match(challenge.text, /Two-factor authentication/);
  // App still blocked
  assert.equal(
    (
      await request(port, '/api/cctv/sources', {
        headers: { Cookie: `ee_mfa=${mfaCookieVal}` },
      })
    ).status,
    401,
  );
  const verified = await request(port, '/login/2fa', {
    method: 'POST',
    headers: {
      Cookie: `ee_mfa=${mfaCookieVal}`,
      Origin: `http://127.0.0.1:${port}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `code=${generateTotpCode(secret)}&next=/`,
  });
  assert.equal(verified.status, 303);
  const jar = [].concat(verified.headers['set-cookie'] || []).join('\n');
  assert.match(jar, /ee_session=/);
  assert.match(jar, /ee_trust=/);
  const sessionCookieVal = /ee_session=([^;]+)/.exec(jar)[1];
  assert.equal(
    (
      await request(port, '/api/cctv/sources', {
        headers: { Cookie: `ee_session=${sessionCookieVal}` },
      })
    ).status,
    200,
  );

  // Trusted device skips MFA on next password login
  const trustVal = /ee_trust=([^;]+)/.exec(jar)[1];
  const trustedLogin = await postLogin(
    port,
    { username: USER, password: PASS, remember: '1' },
    { Cookie: `ee_trust=${trustVal}` },
  );
  assert.equal(trustedLogin.status, 303);
  assert.equal(trustedLogin.headers.location, '/');
  assert.match(
    [].concat(trustedLogin.headers['set-cookie'] || []).join('\n'),
    /ee_session=/,
  );

  // Security page + email honest gate
  const sec = await request(port, '/account/security', {
    headers: {
      ...HTML,
      Cookie: cookieFrom(trustedLogin),
    },
  });
  assert.equal(sec.status, 200, sec.text.slice(0, 200));
  assert.match(sec.text, /Account security/);
  assert.match(sec.text, /Email verification is not available yet/);
  assert.match(sec.text, /Two-factor authentication/);
});

test('AUTH-6: trust auth round-trip', () => {
  const trust = createTrustAuth({ secret: SECRET });
  const deviceId = trust.newDeviceId();
  const { token } = trust.issue({ sub: 'admin', deviceId });
  const got = trust.verify(token);
  assert.equal(got.sub, 'admin');
  assert.equal(got.deviceId, deviceId);
  assert.equal(hashDeviceId(deviceId).length > 20, true);
});

test('AUTH-5: MFA pending cookie does not grant API', () => {
  const pending = createMfaPendingAuth({ secret: SECRET });
  const { token } = pending.issue({ sub: 'admin', remember: true, next: '/' });
  assert.equal(pending.verify(token).sub, 'admin');
  assert.equal(MFA_COOKIE, 'ee_mfa');
});

test('AUTH-8: sign out other sessions bumps epoch; this cookie stays, others die', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ee-mfa-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { port } = await start(t, { EE_AUTH_DATA_DIR: dir });
  const a = await postLogin(port, {
    username: USER,
    password: PASS,
    remember: '1',
  });
  const cookieA = cookieFrom(a);
  const b = await postLogin(port, {
    username: USER,
    password: PASS,
    remember: '1',
  });
  const cookieB = cookieFrom(b);
  assert.equal(
    (await request(port, '/api/cctv/sources', { headers: { Cookie: cookieA } }))
      .status,
    200,
  );
  assert.equal(
    (await request(port, '/api/cctv/sources', { headers: { Cookie: cookieB } }))
      .status,
    200,
  );
  const revoke = await request(port, '/account/sessions/revoke', {
    method: 'POST',
    headers: {
      Cookie: cookieA,
      Origin: `http://127.0.0.1:${port}`,
    },
  });
  assert.equal(revoke.status, 303);
  const jar = [].concat(revoke.headers['set-cookie'] || []).join('\n');
  assert.match(jar, /ee_session=/);
  const cookieA2 = /ee_session=([^;]+)/.exec(jar)[0];
  assert.equal(
    (
      await request(port, '/api/cctv/sources', {
        headers: { Cookie: cookieA2 },
      })
    ).status,
    200,
    'current session re-issued',
  );
  assert.equal(
    (
      await request(port, '/api/cctv/sources', {
        headers: { Cookie: cookieB },
      })
    ).status,
    401,
    'other session invalidated',
  );
  const sec = await request(port, '/account/security', {
    headers: { ...HTML, Cookie: cookieA2 },
  });
  assert.match(sec.text, /Sign out other sessions/);
});


test('resolveReviewerConfig: both-or-neither, null when unset', () => {
  assert.equal(resolveReviewerConfig({}), null);
  assert.equal(
    resolveReviewerConfig({ REVIEWER_USER: '', REVIEWER_PASS: '' }),
    null,
  );
  assert.deepEqual(
    resolveReviewerConfig({
      REVIEWER_USER: 'ee-reviewer',
      REVIEWER_PASS: 'rev-pass-123',
    }),
    { user: 'ee-reviewer', pass: 'rev-pass-123' },
  );
  assert.throws(
    () => resolveReviewerConfig({ REVIEWER_USER: 'only' }),
    /REVIEWER_USER and REVIEWER_PASS must be set together/,
  );
  assert.throws(
    () => resolveReviewerConfig({ REVIEWER_PASS: 'only' }),
    /REVIEWER_USER and REVIEWER_PASS must be set together/,
  );
  assert.throws(
    () =>
      resolveProductionConfig({
        REVIEWER_USER: 'r',
        REVIEWER_PASS: 'p',
      }),
    /REVIEWER_USER\/REVIEWER_PASS require LOGIN/,
  );
  const cfg = resolveProductionConfig({
    LOGIN_USER: USER,
    LOGIN_PASS: PASS,
    SESSION_SECRET: SECRET,
    REVIEWER_USER: 'ee-reviewer',
    REVIEWER_PASS: 'rev-pass-123',
  });
  assert.equal(cfg.reviewer.user, 'ee-reviewer');
  assert.equal(cfg.login.user, USER);
});

test('env reviewer store + composite: owner first, distinct ids', () => {
  const owner = createEnvAdminStore({ user: USER, pass: PASS });
  const reviewer = createEnvReviewerStore({
    user: 'ee-reviewer',
    pass: 'rev-pass-123',
  });
  assert.deepEqual(reviewer.authenticate('ee-reviewer', 'rev-pass-123'), {
    id: 'reviewer',
    displayName: 'Reviewer',
    role: REVIEWER_ROLE,
  });
  assert.equal(reviewer.authenticate('ee-reviewer', 'wrong'), null);
  assert.equal(reviewer.authenticate(USER, PASS), null);
  assert.equal(reviewer.roleOf('reviewer'), REVIEWER_ROLE);
  assert.equal(reviewer.roleOf('admin'), null);
  assert.ok(reviewer.credentialVersion('reviewer'));
  assert.equal(reviewer.credentialVersion('admin'), null);

  const composite = createCompositeUserStore([owner, reviewer]);
  assert.deepEqual(composite.authenticate(USER, PASS), {
    id: 'admin',
    displayName: 'Owner',
    role: OWNER_ROLE,
  });
  assert.deepEqual(composite.authenticate('ee-reviewer', 'rev-pass-123'), {
    id: 'reviewer',
    displayName: 'Reviewer',
    role: REVIEWER_ROLE,
  });
  assert.equal(composite.authenticate('ee-reviewer', 'nope'), null);
  assert.equal(composite.roleOf('admin'), OWNER_ROLE);
  assert.equal(composite.roleOf('reviewer'), REVIEWER_ROLE);
  assert.ok(composite.credentialVersion('admin'));
  assert.ok(composite.credentialVersion('reviewer'));
  assert.equal(composite.credentialVersion('ghost'), null);
});

test('production: reviewer can sign in; owner break-glass untouched; owner-only APIs gated', async (t) => {
  const REV_USER = 'ee-reviewer';
  const REV_PASS = 'rev-pass-123';
  const { port } = await start(t, {
    REVIEWER_USER: REV_USER,
    REVIEWER_PASS: REV_PASS,
  });

  const bad = await postLogin(port, {
    username: REV_USER,
    password: 'wrong',
  });
  assert.equal(bad.status, 200);
  assert.match(bad.text, /Invalid credentials/);
  assert.equal(bad.headers['set-cookie'], undefined);

  const rev = await postLogin(port, {
    username: REV_USER,
    password: REV_PASS,
  });
  assert.equal(rev.status, 303);
  const revCookie = cookieFrom(rev);
  assert.match(revCookie, /ee_session=/);

  const home = await request(port, '/', { headers: { Cookie: revCookie } });
  assert.equal(home.status, 200);
  assert.match(home.text, /Earth Eye app/);

  const sess = await request(port, '/api/session', {
    headers: { Cookie: revCookie, Accept: 'application/json' },
  });
  assert.equal(sess.status, 200);
  const sessBody = JSON.parse(sess.text);
  assert.equal(sessBody.authenticated, true);
  assert.equal(sessBody.role, 'reviewer');
  assert.equal(sessBody.userId, 'reviewer');

  const ownerSummary = await request(port, '/api/atlas/owner-summary', {
    headers: { Cookie: revCookie, Accept: 'application/json' },
  });
  assert.equal(ownerSummary.status, 403);
  assert.match(ownerSummary.text, /Owner only/);

  const wsWrite = await request(port, '/api/atlas/workspaces', {
    method: 'POST',
    headers: {
      Cookie: revCookie,
      'Content-Type': 'application/json',
      Origin: `http://127.0.0.1:${port}`,
      Host: `127.0.0.1:${port}`,
    },
    body: JSON.stringify({ name: 'nope', layers: [] }),
  });
  assert.equal(wsWrite.status, 403);

  // Owner break-glass still works with the same LOGIN_* credentials.
  const ownerLogin = await postLogin(port, {
    username: USER,
    password: PASS,
  });
  assert.equal(ownerLogin.status, 303);
  const ownerCookie = cookieFrom(ownerLogin);
  const ownerSess = JSON.parse(
    (
      await request(port, '/api/session', {
        headers: { Cookie: ownerCookie, Accept: 'application/json' },
      })
    ).text,
  );
  assert.equal(ownerSess.role, 'owner');
  assert.equal(ownerSess.userId, 'admin');
  const ownerOk = await request(port, '/api/atlas/owner-summary', {
    headers: { Cookie: ownerCookie, Accept: 'application/json' },
  });
  // Plugin may 200 with summary, or 404 if plugin stack order differs — not 403.
  assert.notEqual(ownerOk.status, 403);

  // Signup remains closed.
  const signup = await request(port, '/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: `http://127.0.0.1:${port}`,
      Host: `127.0.0.1:${port}`,
    },
    body: 'name=x&email=a%40b.c&password=zzzzzzzz',
  });
  assert.equal(signup.status, 403);
  assert.match(signup.text, /Private beta is currently closed/);
});
