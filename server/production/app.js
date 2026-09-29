import http from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { applicationApiPlugins } from '../standalone/api-plugins.js';
import { createMiddlewareStack } from './middleware-stack.js';
import { createStaticHandler } from './static.js';
import {
  applySecurityHeaders,
  clientAddress,
  createFixedWindowLimiter,
  isHttpsRequest,
  isMeteredApiPath,
  normalizeHost,
  resolveProductionConfig,
  safeEqual,
} from './policy.js';
import {
  SESSION_COOKIE,
  MFA_COOKIE,
  clearedSessionCookie,
  clearedMfaCookie,
  createLoginLimiter,
  createMfaPendingAuth,
  createSessionAuth,
  mfaCookie,
  parseCookies,
  readForm,
  safeNextPath,
  sameOriginRequest,
  sessionCookie,
} from './session-auth.js';
import { createMfaStore, resolveMfaDataDir } from './mfa-store.js';
import {
  TRUST_COOKIE,
  clearedTrustCookie,
  createTrustAuth,
  trustCookie,
} from './trust-device.js';
import QRCode from 'qrcode';
import {
  INFO_PAGES,
  MESSAGES,
  loadWordmarkSvg,
  renderLoginPage,
} from './login-page.js';
import {
  appendAuditEvent,
  clientTag,
} from '../entitlements/auditLog.js';
import {
  OWNER_ROLE,
  REVIEWER_ROLE,
  createAccountAuthority,
  createClosedRegistration,
  createCompositeUserStore,
  createEnvAdminStore,
  createEnvReviewerStore,
} from './users.js';
import { resolveAuthProviders } from './auth-providers.js';

/**
 * Brand images the sign-in page (and the browser's own tab/home-screen icon
 * requests) may load before signing in. No application code or data.
 */
const PUBLIC_ICON_PATHS = new Set([
  '/favicon.svg',
  '/favicon.ico',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
]);

/** API routes the production server refuses under the locked policy. */
export const EXCLUDED_API_PREFIXES = Object.freeze(['/api/radio']);

/** True for a path under an excluded API prefix (segment boundary). */
export function isExcludedApiPath(pathname) {
  const p = String(pathname || '').toLowerCase();
  return EXCLUDED_API_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  );
}

/**
 * Admin / secret-adjacent API routes the temporary reviewer must not hit.
 * Globe data APIs stay open to any authenticated session.
 */
export function isOwnerOnlyApi(pathname, method = 'GET') {
  const p = String(pathname || '').toLowerCase();
  const m = String(method || 'GET').toUpperCase();
  if (p === '/api/atlas/owner-summary' || p.startsWith('/api/atlas/owner-summary/'))
    return true;
  if (p === '/api/atlas/audit-log' || p.startsWith('/api/atlas/audit-log/'))
    return true;
  // Env-name presence report — owner only. Reviewers use /api/atlas/capabilities.
  if (
    p === '/api/atlas/provider-status' ||
    p.startsWith('/api/atlas/provider-status/')
  )
    return true;
  // Workspace writes are owner admin; GET list/read stays available for critique.
  if (
    (p === '/api/atlas/workspaces' || p.startsWith('/api/atlas/workspaces/')) &&
    !['GET', 'HEAD', 'OPTIONS'].includes(m)
  )
    return true;
  return false;
}

/**
 * Standalone production HTTP server: serves the built `dist/` and mounts the
 * SAME API handlers `vite dev` / `vite preview` use, by running each provider
 * plugin's `configurePreviewServer` hook against a Connect-compatible stack.
 * No Vite code is imported at runtime.
 *
 * Request pipeline: security headers → /healthz → host allowlist → origin
 * secret → /terms, /privacy, /login, /login/2fa, /signup, /forgot, /account/*, /logout (and brand icons) →
 * session gate → /api/session → (/api: rate
 * limits, body limit, provider handlers) or static files with SPA fallback.
 *
 * When LOGIN_USER/LOGIN_PASS (or BASIC_AUTH_USER/BASIC_AUTH_PASS) are set,
 * every other route needs a valid `ee_session` cookie: page navigations are
 * redirected to /login, everything else (API, assets, manifest, WebSocket
 * upgrades) gets 401 JSON. No response ever carries WWW-Authenticate, so the
 * browser's native credentials popup never appears.
 *
 * @param {object} [options]
 * @param {string} options.distDir - Built client (must contain index.html).
 * @param {NodeJS.ProcessEnv} [options.env] - Source of server configuration.
 * @param {object[]} [options.plugins] - Defaults to the application API.
 * @param {() => number} [options.now]
 */
export async function createProductionApp({
  distDir,
  env = process.env,
  plugins = applicationApiPlugins(),
  now = Date.now,
} = {}) {
  const config = resolveProductionConfig(env);
  if (!distDir || !existsSync(path.join(distDir, 'index.html')))
    throw new Error(
      `No production build at ${distDir || '(unset)'}; run "npm run build" first`,
    );

  const stack = createMiddlewareStack();
  // AUTH-1: env-admin owner path is permanent break-glass; registration closed.
  // Optional REVIEWER_* adds a composite second account (owner first).
  // AUTH-8: sessionEpoch (from MFA store) is folded into credentialVersion so
  // "sign out other sessions" invalidates every other ee_session cookie.
  const envStores = [];
  if (config.login) envStores.push(createEnvAdminStore(config.login));
  if (config.reviewer) envStores.push(createEnvReviewerStore(config.reviewer));
  const userStore =
    envStores.length === 0
      ? null
      : envStores.length === 1
        ? envStores[0]
        : createCompositeUserStore(envStores);
  let mfaStore = null;
  const epochAwareStore = userStore
    ? {
        authenticate: (id, pw) => userStore.authenticate(id, pw),
        credentialVersion(id) {
          const base = userStore.credentialVersion(id);
          if (!base) return null;
          const epoch = mfaStore?.getSessionEpoch?.(id) ?? 0;
          return `${base}:${epoch}`;
        },
        roleOf(id) {
          return userStore.roleOf?.(id) ?? null;
        },
      }
    : null;
  const accounts = epochAwareStore
    ? createAccountAuthority({
        userStore: epochAwareStore,
        registration: createClosedRegistration(),
      })
    : null;
  const registration = accounts?.registration ?? createClosedRegistration();
  const authProviders = resolveAuthProviders(env);
  const auth = accounts
    ? createSessionAuth({
        secret: config.login.sessionSecret,
        userStore: accounts,
        now,
      })
    : null;
  mfaStore =
    auth && config.login.sessionSecret
      ? createMfaStore({
          dataDir: resolveMfaDataDir(env),
          keyMaterial: config.login.sessionSecret,
          now,
        })
      : null;
  const mfaPending = auth
    ? createMfaPendingAuth({ secret: config.login.sessionSecret, now })
    : null;
  const trustAuth = auth
    ? createTrustAuth({ secret: config.login.sessionSecret, now })
    : null;
  const loginLimiter = createLoginLimiter({ now });
  const wordmarkSvg = auth
    ? loadWordmarkSvg([
        path.join(distDir, 'brand', 'eartheye-wordmark-animated.svg'),
        path.resolve(
          distDir,
          '..',
          'public',
          'brand',
          'eartheye-wordmark-animated.svg',
        ),
      ])
    : null;
  const serveStatic = createStaticHandler({
    root: distDir,
    privateCache: Boolean(auth),
  });
  const apiLimiter = createFixedWindowLimiter({
    max: config.rateLimitApiPerMin,
    now,
  });
  const meteredLimiter = createFixedWindowLimiter({
    max: config.rateLimitMeteredPerMin,
    now,
  });
  const startedAt = now();
  let draining = false;

  const json = (res, status, payload, headers = {}) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    });
    res.end(JSON.stringify(payload));
  };

  async function handle(req, res) {
    const url = String(req.url || '');
    if (!url.startsWith('/')) return json(res, 400, { error: 'Bad request' });
    applySecurityHeaders(req, res, config);
    if (draining) res.setHeader('Connection', 'close');
    const query = url.indexOf('?');
    const pathname = query === -1 ? url : url.slice(0, query);

    // Health first: Fly's checks reach the machine directly, with no custom
    // Host header and no login, and must not consume API quota.
    if (pathname === '/healthz') {
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return json(
          res,
          405,
          { error: 'Method not allowed' },
          { Allow: 'GET, HEAD' },
        );
      return json(res, draining ? 503 : 200, {
        ok: !draining,
        uptimeSec: Math.round((now() - startedAt) / 1000),
      });
    }

    if (config.allowedHosts.length) {
      const host = normalizeHost(req.headers.host);
      if (!config.allowedHosts.includes(host)) {
        if (
          config.allowedHostsAction === 'redirect' &&
          (req.method === 'GET' || req.method === 'HEAD')
        ) {
          res.writeHead(308, {
            Location: `https://${config.allowedHosts[0]}${url}`,
            'Cache-Control': 'no-store',
          });
          return res.end();
        }
        return json(res, 421, { error: 'Misdirected request' });
      }
    }

    if (config.originAuth) {
      const presented = String(req.headers[config.originAuth.header] || '');
      if (!presented || !safeEqual(presented, config.originAuth.secret))
        return json(res, 403, { error: 'Forbidden' });
    }

    if (pathname === '/terms' || pathname === '/privacy')
      return handleInfoPage(req, res, INFO_PAGES[pathname.slice(1)]);

    if (
      pathname === '/login' ||
      pathname === '/login/2fa' ||
      pathname === '/logout' ||
      pathname === '/signup' ||
      pathname === '/forgot'
    ) {
      if (!auth) {
        req.resume();
        res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (pathname === '/login') return handleLogin(req, res, url);
      if (pathname === '/login/2fa') return handleMfaChallenge(req, res, url);
      if (pathname === '/signup') return handleSignup(req, res, url);
      if (pathname === '/forgot') return handleForgot(req, res);
      return handleLogout(req, res);
    }

    // Account security (AUTH-5/6/7): requires a full session, not MFA-pending.
    if (pathname === '/account/security' || pathname.startsWith('/account/')) {
      if (!auth) {
        req.resume();
        res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
        return res.end();
      }
      const session = readSession(req);
      if (!session) return unauthenticated(req, res, pathname, url);
      return handleAccount(req, res, pathname, session);
    }

    let session = null;
    if (auth) {
      if (
        PUBLIC_ICON_PATHS.has(pathname) &&
        (req.method === 'GET' || req.method === 'HEAD')
      )
        return serveStatic(req, res);
      session = readSession(req);
      if (!session) return unauthenticated(req, res, pathname, url);
      if (auth.shouldReissue(session))
        res.setHeader(
          'Set-Cookie',
          sessionCookie(
            auth.issue(
              { id: session.sub },
              { remember: session.remember !== false },
            ).token,
            {
              secure: secureRequest(req),
              remember: session.remember !== false,
            },
          ),
        );
    }

    // Lets the app show its Log Out button only when a sign-in is active.
    // role / userId help the client hide owner-only chrome (Keys still mostly
    // client-local on hosted — see docs/REVIEWER_ACCESS.md).
    if (pathname === '/api/session' && req.method === 'GET') {
      const role = session
        ? accounts?.roleOf?.(session.sub) || OWNER_ROLE
        : null;
      return json(res, 200, {
        authEnabled: Boolean(auth),
        authenticated: Boolean(auth),
        role: auth ? role : null,
        userId: session?.sub || null,
      });
    }

    if (pathname === '/api' || pathname.startsWith('/api/'))
      return handleApi(req, res, pathname, session);
    return serveStatic(req, res);
  }

  function secureRequest(req) {
    return isHttpsRequest(req, config);
  }

  function readSession(req) {
    if (!auth) return null;
    return auth.verify(parseCookies(req.headers.cookie).get(SESSION_COOKIE));
  }

  function isNavigation(req) {
    const mode = String(req.headers['sec-fetch-mode'] || '');
    const dest = String(req.headers['sec-fetch-dest'] || '');
    if (mode === 'navigate' || dest === 'document') return true;
    return String(req.headers.accept || '').includes('text/html');
  }

  function unauthenticated(req, res, pathname, url) {
    const api = pathname === '/api' || pathname.startsWith('/api/');
    if (
      !api &&
      (req.method === 'GET' || req.method === 'HEAD') &&
      isNavigation(req)
    ) {
      const next = safeNextPath(url);
      res.writeHead(302, {
        Location:
          next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`,
        'Cache-Control': 'no-store',
      });
      return res.end();
    }
    req.resume();
    return json(res, 401, {
      error: 'Authentication required',
      login: '/login',
    });
  }

  function sendLoginPage(req, res, status, options, headers = {}) {
    const page = renderLoginPage({
      wordmarkSvg,
      providers: authProviders,
      emailConfigured: authProviders.email.configured,
      ...options,
    });
    const body = Buffer.from(page.html, 'utf8');
    if (res.headersSent) return res.destroy();
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'Content-Security-Policy': page.csp,
      'X-Robots-Tag': 'noindex, nofollow',
      ...headers,
    });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }

  function redirect(res, status, location, headers = {}) {
    res.writeHead(status, {
      Location: location,
      'Cache-Control': 'no-store',
      ...headers,
    });
    res.end();
  }

  async function handleLogin(req, res, url) {
    const params = new URLSearchParams(
      url.includes('?') ? url.slice(url.indexOf('?') + 1) : '',
    );
    if (req.method === 'GET' || req.method === 'HEAD') {
      const next = safeNextPath(params.get('next'));
      if (readSession(req)) return redirect(res, 302, next);
      return sendLoginPage(req, res, 200, {
        next,
        notice: params.has('signedout') ? MESSAGES.signedOut : '',
      });
    }
    if (req.method !== 'POST') {
      req.resume();
      return json(
        res,
        405,
        { error: 'Method not allowed' },
        { Allow: 'GET, HEAD, POST' },
      );
    }
    if (!sameOriginRequest(req, normalizeHost)) {
      req.resume();
      return sendLoginPage(req, res, 403, { error: MESSAGES.forbidden });
    }
    const key = clientAddress(req, config);
    const allowed = loginLimiter.check(key);
    if (!allowed.ok) {
      req.resume();
      const minutes = Math.max(1, Math.ceil(allowed.retryAfterSec / 60));
      console.warn(`[auth] sign-in rate limited ip=${key}`);
      appendAuditEvent('auth.login.rate_limited', { client: clientTag(key) });
      return sendLoginPage(
        req,
        res,
        429,
        { error: MESSAGES.limited(minutes) },
        { 'Retry-After': String(allowed.retryAfterSec) },
      );
    }
    const form = await readForm(req);
    if (!form)
      return sendLoginPage(req, res, 400, { error: MESSAGES.badRequest });
    const next = safeNextPath(form.get('next'));
    const username = form.get('username') ?? '';
    const remember =
      form.get('remember') === '1' || form.get('remember') === 'on';
    const user = accounts.authenticate(username, form.get('password') ?? '');
    if (!user) {
      loginLimiter.fail(key);
      console.warn(`[auth] sign-in failed ip=${key}`);
      appendAuditEvent('auth.login.fail', { client: clientTag(key) });
      // 200, not 401: a 401 without a challenge is non-standard, and the
      // form page is the whole answer here (no browser popup either way).
      return sendLoginPage(req, res, 200, {
        next,
        username: username.slice(0, 200),
        remember,
        error: MESSAGES.invalid,
      });
    }
    loginLimiter.succeed(key);
    const secure = secureRequest(req);
    const mfaOn = Boolean(mfaStore?.isEnabled(user.id));
    if (mfaOn) {
      const trustTok = parseCookies(req.headers.cookie).get(TRUST_COOKIE);
      const trusted = trustTok ? trustAuth.verify(trustTok) : null;
      if (
        trusted &&
        trusted.sub === user.id &&
        mfaStore.isTrustedDevice(user.id, trusted.deviceId)
      ) {
        console.log(`[auth] sign-in ok (trusted device) ip=${key}`);
        appendAuditEvent('auth.login.ok', {
          client: clientTag(key),
          role: user.role || 'owner',
          mfa: 'trusted-device',
        });
        const issued = auth.issue(user, { remember });
        return redirect(res, 303, next, {
          'Set-Cookie': [
            sessionCookie(issued.token, { secure, remember }),
            clearedMfaCookie({ secure }),
          ],
        });
      }
      // Password ok but MFA required — no full session yet.
      console.log(`[auth] sign-in pending mfa ip=${key}`);
      appendAuditEvent('auth.login.mfa_required', {
        client: clientTag(key),
        role: user.role || 'owner',
      });
      const pending = mfaPending.issue({ sub: user.id, remember, next });
      return redirect(res, 303, '/login/2fa', {
        'Set-Cookie': [
          mfaCookie(pending.token, { secure }),
          clearedSessionCookie({ secure }),
        ],
      });
    }
    console.log(`[auth] sign-in ok ip=${key}`);
    appendAuditEvent('auth.login.ok', {
      client: clientTag(key),
      role: user.role || 'owner',
    });
    const issued = auth.issue(user, { remember });
    return redirect(res, 303, next, {
      'Set-Cookie': [
        sessionCookie(issued.token, { secure, remember }),
        clearedMfaCookie({ secure }),
      ],
    });
  }

  function handleInfoPage(req, res, info) {
    req.resume();
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return json(
        res,
        405,
        { error: 'Method not allowed' },
        { Allow: 'GET, HEAD' },
      );
    return sendLoginPage(req, res, 200, { mode: 'info', info });
  }

  /**
   * Registration is closed (private beta): the body is never read, nothing
   * is stored and no account is created. Forms get the Create Account tab
   * with the message; other clients get the same message as JSON.
   */
  function handleSignup(req, res, url) {
    req.resume();
    const params = new URLSearchParams(
      url.includes('?') ? url.slice(url.indexOf('?') + 1) : '',
    );
    const next = safeNextPath(params.get('next'));
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (readSession(req)) return redirect(res, 302, next);
      return sendLoginPage(req, res, 200, { mode: 'signup', next });
    }
    if (req.method !== 'POST')
      return json(
        res,
        405,
        { error: 'Method not allowed' },
        { Allow: 'GET, HEAD, POST' },
      );
    const { message } = registration.register();
    const type = String(req.headers['content-type'] || '').toLowerCase();
    if (
      type.startsWith('application/x-www-form-urlencoded') ||
      type.startsWith('multipart/form-data')
    )
      return sendLoginPage(req, res, 403, {
        mode: 'signup',
        next,
        error: message,
      });
    return json(res, 403, { error: message });
  }

  function readMfaPending(req) {
    if (!mfaPending) return null;
    return mfaPending.verify(
      parseCookies(req.headers.cookie).get(MFA_COOKIE),
    );
  }

  function setCookies(res, cookies) {
    const list = [].concat(cookies).filter(Boolean);
    if (list.length === 1) res.setHeader('Set-Cookie', list[0]);
    else if (list.length > 1) res.setHeader('Set-Cookie', list);
  }

  async function handleMfaChallenge(req, res, url) {
    const params = new URLSearchParams(
      url.includes('?') ? url.slice(url.indexOf('?') + 1) : '',
    );
    const pending = readMfaPending(req);
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (readSession(req)) return redirect(res, 302, safeNextPath(params.get('next')));
      if (!pending)
        return redirect(res, 302, '/login');
      return sendLoginPage(req, res, 200, {
        mode: 'mfa',
        next: safeNextPath(pending.next || params.get('next')),
      });
    }
    if (req.method !== 'POST') {
      req.resume();
      return json(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD, POST' });
    }
    if (!sameOriginRequest(req, normalizeHost)) {
      req.resume();
      return sendLoginPage(req, res, 403, { mode: 'mfa', error: MESSAGES.forbidden });
    }
    if (!pending || !mfaStore) {
      req.resume();
      return redirect(res, 302, '/login');
    }
    const form = await readForm(req);
    if (!form)
      return sendLoginPage(req, res, 400, {
        mode: 'mfa',
        error: MESSAGES.badRequest,
      });
    const code = form.get('code') ?? '';
    const next = safeNextPath(form.get('next') || pending.next);
    const result = mfaStore.verifyLogin(pending.sub, code);
    const secure = secureRequest(req);
    if (!result.ok) {
      appendAuditEvent('auth.mfa.fail', { client: clientTag(clientAddress(req, config)) });
      return sendLoginPage(req, res, 200, {
        mode: 'mfa',
        next,
        error: MESSAGES.mfaInvalid,
      });
    }
    appendAuditEvent('auth.mfa.ok', {
      client: clientTag(clientAddress(req, config)),
      via: result.via,
    });
    const issued = auth.issue({ id: pending.sub }, { remember: pending.remember });
    const cookies = [
      sessionCookie(issued.token, { secure, remember: pending.remember }),
      clearedMfaCookie({ secure }),
    ];
    if (pending.remember && trustAuth) {
      const deviceId = trustAuth.newDeviceId();
      mfaStore.rememberDevice(pending.sub, deviceId, { label: 'Browser' });
      cookies.push(
        trustCookie(trustAuth.issue({ sub: pending.sub, deviceId }).token, {
          secure,
        }),
      );
    }
    return redirect(res, 303, next, { 'Set-Cookie': cookies });
  }

  async function handleAccount(req, res, pathname, session) {
    if (!mfaStore) {
      req.resume();
      return sendLoginPage(req, res, 503, {
        mode: 'security',
        error: 'Two-factor storage requires SESSION_SECRET.',
        mfaStatus: { enabled: false, pending: false, recoveryRemaining: 0 },
      });
    }
    const secure = secureRequest(req);

    if (pathname === '/account/security') {
      req.resume();
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return json(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD' });
      return sendLoginPage(req, res, 200, {
        mode: 'security',
        mfaStatus: mfaStore.status(session.sub),
        trustedDevices: mfaStore.listTrustedDevices(session.sub),
      });
    }

    if (pathname === '/account/2fa/start' && req.method === 'POST') {
      req.resume();
      if (!sameOriginRequest(req, normalizeHost))
        return json(res, 403, { error: 'Forbidden' });
      const role = accounts?.roleOf?.(session.sub);
      const accountName =
        role === REVIEWER_ROLE
          ? 'reviewer'
          : config.login?.user || 'owner';
      const began = mfaStore.beginEnroll(session.sub, {
        accountName,
      });
      let qrDataUrl = '';
      try {
        qrDataUrl = await QRCode.toDataURL(began.otpauth, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 200,
        });
      } catch {
        qrDataUrl = '';
      }
      return sendLoginPage(req, res, 200, {
        mode: 'mfa-enroll',
        totpSecret: began.secret,
        qrDataUrl,
      });
    }

    if (pathname === '/account/2fa/confirm' && req.method === 'POST') {
      if (!sameOriginRequest(req, normalizeHost)) {
        req.resume();
        return json(res, 403, { error: 'Forbidden' });
      }
      const form = await readForm(req);
      const code = form?.get('code') ?? '';
      const result = mfaStore.confirmEnroll(session.sub, code);
      if (!result.ok) {
        const pending = mfaStore.peekPending(session.sub);
        let qrDataUrl = '';
        if (pending?.otpauth) {
          try {
            qrDataUrl = await QRCode.toDataURL(pending.otpauth, {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 200,
            });
          } catch {
            qrDataUrl = '';
          }
        }
        return sendLoginPage(req, res, 200, {
          mode: 'mfa-enroll',
          error: result.error,
          totpSecret: pending?.secret || '',
          qrDataUrl,
        });
      }
      return sendLoginPage(req, res, 200, {
        mode: 'mfa-recovery',
        recoveryCodes: result.recoveryCodes,
      });
    }

    if (pathname === '/account/2fa/cancel' && req.method === 'POST') {
      req.resume();
      if (!sameOriginRequest(req, normalizeHost))
        return json(res, 403, { error: 'Forbidden' });
      mfaStore.cancelEnroll(session.sub);
      return redirect(res, 303, '/account/security');
    }

    if (pathname === '/account/2fa/disable' && req.method === 'POST') {
      if (!sameOriginRequest(req, normalizeHost)) {
        req.resume();
        return json(res, 403, { error: 'Forbidden' });
      }
      const form = await readForm(req);
      const result = mfaStore.disable(session.sub, form?.get('code') ?? '');
      if (!result.ok)
        return sendLoginPage(req, res, 200, {
          mode: 'security',
          error: result.error,
          mfaStatus: mfaStore.status(session.sub),
          trustedDevices: mfaStore.listTrustedDevices(session.sub),
        });
      return redirect(res, 303, '/account/security', {
        'Set-Cookie': clearedTrustCookie({ secure }),
      });
    }

    if (pathname === '/account/devices/revoke' && req.method === 'POST') {
      req.resume();
      if (!sameOriginRequest(req, normalizeHost))
        return json(res, 403, { error: 'Forbidden' });
      mfaStore.revokeTrustedDevices(session.sub);
      return redirect(res, 303, '/account/security', {
        'Set-Cookie': clearedTrustCookie({ secure }),
      });
    }

    // AUTH-8: bump session epoch + revoke trusts; re-issue THIS session only.
    if (pathname === '/account/sessions/revoke' && req.method === 'POST') {
      req.resume();
      if (!sameOriginRequest(req, normalizeHost))
        return json(res, 403, { error: 'Forbidden' });
      mfaStore.bumpSessionEpoch(session.sub);
      appendAuditEvent('auth.sessions.revoke_others', {
        client: clientTag(clientAddress(req, config)),
      });
      const issued = auth.issue(
        { id: session.sub },
        { remember: session.remember !== false },
      );
      return redirect(res, 303, '/account/security', {
        'Set-Cookie': [
          sessionCookie(issued.token, {
            secure,
            remember: session.remember !== false,
          }),
          clearedTrustCookie({ secure }),
          clearedMfaCookie({ secure }),
        ],
      });
    }

    req.resume();
    return json(res, 404, { error: 'Not found' });
  }

  /**
   * Forgot password: honest UI. No email provider → explain owner Fly secret
   * rotation. When email is configured later, POST accepts the form; AUTH-3
   * sends mail. AUTH-2 never invents delivery.
   */
  function handleForgot(req, res) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (readSession(req)) return redirect(res, 302, '/');
      return sendLoginPage(req, res, 200, { mode: 'forgot' });
    }
    if (req.method !== 'POST') {
      req.resume();
      return json(
        res,
        405,
        { error: 'Method not allowed' },
        { Allow: 'GET, HEAD, POST' },
      );
    }
    req.resume();
    if (!authProviders.email.configured) {
      return sendLoginPage(req, res, 503, {
        mode: 'forgot',
        error: MESSAGES.forgotUnavailable,
      });
    }
    // Email configured but reset tokens not implemented yet (AUTH-3).
    return sendLoginPage(req, res, 501, {
      mode: 'forgot',
      notice: MESSAGES.forgotSentPlaceholder,
    });
  }

  function handleLogout(req, res) {
    const session = readSession(req);
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!session) return redirect(res, 302, '/login');
      return sendLoginPage(req, res, 200, { mode: 'logout' });
    }
    req.resume();
    if (req.method !== 'POST')
      return json(
        res,
        405,
        { error: 'Method not allowed' },
        { Allow: 'GET, HEAD, POST' },
      );
    if (!sameOriginRequest(req, normalizeHost))
      return json(res, 403, { error: 'Forbidden' });
    auth.revoke(session);
    const secure = secureRequest(req);
    return redirect(res, 303, '/login?signedout=1', {
      'Set-Cookie': [
        clearedSessionCookie({ secure }),
        clearedMfaCookie({ secure }),
        clearedTrustCookie({ secure }),
      ],
    });
  }

  function handleApi(req, res, pathname, session = null) {
    const key = clientAddress(req, config);
    const limited = (verdict) =>
      json(
        res,
        429,
        { error: 'Rate limit exceeded' },
        { 'Retry-After': String(verdict.retryAfterSec) },
      );
    if (isMeteredApiPath(pathname)) {
      const verdict = meteredLimiter.check(key);
      if (!verdict.ok) return limited(verdict);
    }
    const verdict = apiLimiter.check(key);
    if (!verdict.ok) return limited(verdict);

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const declared = req.headers['content-length'];
      if (declared === undefined && req.headers['transfer-encoding'])
        return json(res, 411, { error: 'Content-Length required' });
      if (Number(declared) > config.maxBodyBytes)
        return json(res, 413, { error: 'Request body too large' });
    }

    // Owner-only admin surfaces: reviewer may use the globe, not mutate
    // owner workspaces / read owner admin snapshot / audit.
    if (auth && session && isOwnerOnlyApi(pathname, req.method)) {
      const role = accounts?.roleOf?.(session.sub);
      if (role !== OWNER_ROLE) {
        req.resume();
        return json(res, 403, {
          error: 'Owner only',
          code: 'owner-only',
        });
      }
    }

    // Locked policy: radio/scanner is excluded from Earth Eye. The upstream
    // Radio Browser proxy is still mounted for local dev tooling, but the
    // production server refuses it outright so no client path can play audio.
    if (isExcludedApiPath(pathname)) {
      req.resume();
      return json(res, 403, {
        error: 'Excluded by Earth Eye policy',
        code: 'excluded-by-policy',
      });
    }

    // The Realtime debug sink appends client-supplied records to disk. Useful
    // on a developer machine, not on a public host: accept and discard unless
    // explicitly enabled.
    if (
      pathname.startsWith('/api/realtime/debug-log') &&
      !config.realtimeDebugLog
    ) {
      req.resume();
      res.statusCode = 204;
      return res.end();
    }

    stack.handle(req, res, (error) => {
      if (error) {
        console.error('[prod] API handler error:', error?.message || error);
        return json(res, 500, { error: 'Internal server error' });
      }
      return json(res, 404, { error: 'Unknown API route' });
    });
    return undefined;
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error('[prod] request failed:', error?.message || error);
      json(res, 500, { error: 'Internal server error' });
    });
  });
  // Fly's proxy keeps idle upstream connections ~60 s; stay open longer so it
  // never reuses a socket we are closing.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 60_000;
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    else socket.destroy();
  });
  // No API route accepts a client WebSocket (AIS is an OUTBOUND socket to
  // AISStream; the browser polls /api/ais-live). Refuse upgrades explicitly;
  // without a session the answer is 401 JSON (never WWW-Authenticate).
  server.on('upgrade', (req, socket) => {
    if (auth && !readSession(req)) {
      const body = JSON.stringify({ error: 'Authentication required' });
      socket.end(
        'HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json; charset=utf-8\r\n' +
          `Cache-Control: no-store\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
      );
      return;
    }
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
  });

  // Mount the provider plugins exactly as `vite preview` does. Vite calls a
  // returned function after its own middlewares; none of ours needs that, but
  // honoring it keeps the contract.
  const previewServer = {
    middlewares: stack,
    httpServer: server,
    config: { root: path.resolve(distDir, '..'), mode: 'production' },
  };
  const postHooks = [];
  for (const plugin of plugins) {
    const hook = plugin?.configurePreviewServer;
    const fn = typeof hook === 'function' ? hook : hook?.handler;
    if (typeof fn !== 'function') continue;
    const post = await fn.call(plugin, previewServer);
    if (typeof post === 'function') postHooks.push(post);
  }
  for (const post of postHooks) await post();

  return {
    config,
    server,
    routes: () => stack.routes(),
    listen(port = config.port, host = config.host) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve(server.address());
        });
      });
    },
    /** Stop accepting, let in-flight requests finish, then emit 'close' (providers dispose). */
    close() {
      draining = true;
      return new Promise((resolve) => {
        if (!server.listening) {
          server.emit('close');
          resolve();
          return;
        }
        server.close(() => resolve());
        server.closeIdleConnections();
      });
    },
  };
}
