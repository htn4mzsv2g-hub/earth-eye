import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * In-app sign-in for the production server (replaces HTTP Basic auth).
 *
 * - Credentials come from the environment (LOGIN_USER/LOGIN_PASS, or the
 *   legacy BASIC_AUTH_USER/BASIC_AUTH_PASS names) and are checked by the
 *   user store in users.js (constant time). They are never written to a
 *   response, a log line or the page.
 * - Sessions are stateless: an HMAC-SHA256-signed `ee_session` cookie keyed
 *   by SESSION_SECRET, so they survive machine restarts. Without
 *   SESSION_SECRET a random per-process key is used (everyone is signed out
 *   on restart). Each token carries a keyed "password version", so changing
 *   the username or password invalidates every existing session.
 * - Sliding expiry: 30-day when Remember me is on; browser-session TTL when off
 *   (re-issued at most once a day while in use).
 * - Unauthenticated requests never get a `WWW-Authenticate` header, so a
 *   browser never shows its native credentials popup.
 */

export const SESSION_COOKIE = 'ee_session';
/** Remember-me / persistent sessions (cookie Max-Age + token expiry). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Browser-session sign-in (no Max-Age; shorter token lifetime). */
export const SESSION_BROWSER_TTL_MS = 16 * 60 * 60 * 1000;
/** Pending MFA challenge after password (not a full session). */
export const MFA_COOKIE = 'ee_mfa';
export const MFA_PENDING_TTL_MS = 10 * 60 * 1000;
const REISSUE_AFTER_MS = 24 * 60 * 60 * 1000;
const TOKEN_VERSION = 'v1';
const MFA_TOKEN_VERSION = 'mfa1';
const MAX_FORM_BYTES = 8 * 1024;

/** Secrets piped from files often carry a trailing newline; drop trailing whitespace only. */
export function cleanEnvSecret(value) {
  return String(value ?? '').replace(/\s+$/u, '');
}

const b64url = (buffer) => Buffer.from(buffer).toString('base64url');

function hmac(key, ...parts) {
  const mac = createHmac('sha256', key);
  for (const part of parts) mac.update(String(part)).update('\0');
  return mac.digest();
}

/**
 * Resolve the login configuration. Returns null when no credentials are set
 * (open server, e.g. a local run). Half-set pairs refuse to boot.
 */
export function resolveLoginConfig(env = process.env) {
  const pairs = [
    ['LOGIN_USER', 'LOGIN_PASS'],
    ['BASIC_AUTH_USER', 'BASIC_AUTH_PASS'],
  ];
  let chosen = null;
  for (const [userName, passName] of pairs) {
    const user = cleanEnvSecret(env[userName]);
    const pass = cleanEnvSecret(env[passName]);
    if (Boolean(user) !== Boolean(pass))
      throw new Error(`${userName} and ${passName} must be set together`);
    if (user && !chosen) chosen = { user, pass, source: userName };
  }
  if (!chosen) return null;
  const secret = cleanEnvSecret(env.SESSION_SECRET);
  if (secret && secret.length < 32)
    throw new Error('SESSION_SECRET must be at least 32 characters');
  return Object.freeze({
    ...chosen,
    sessionSecret: secret || null,
  });
}

/**
 * Optional reviewer account (REVIEWER_USER / REVIEWER_PASS). Both-or-neither
 * like LOGIN_*: half-set refuses to boot. Returns null when unset. Does not
 * require SESSION_SECRET (that comes from resolveLoginConfig / LOGIN_*).
 */
export function resolveReviewerConfig(env = process.env) {
  const user = cleanEnvSecret(env.REVIEWER_USER);
  const pass = cleanEnvSecret(env.REVIEWER_PASS);
  if (Boolean(user) !== Boolean(pass))
    throw new Error('REVIEWER_USER and REVIEWER_PASS must be set together');
  if (!user) return null;
  return Object.freeze({ user, pass });
}

/** Parse a Cookie header into a Map (first occurrence wins). */
export function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name || cookies.has(name)) continue;
    cookies.set(name, part.slice(eq + 1).trim());
  }
  return cookies;
}

/**
 * Only same-origin relative paths are accepted as a post-login destination.
 * Anything else (absolute URLs, protocol-relative `//host`, backslashes,
 * control characters, the auth routes themselves) falls back to `/`.
 */
export function safeNextPath(value) {
  const raw = String(value ?? '');
  if (!raw || raw.length > 2048) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  if (/[\\\u0000-\u001f\u007f]/u.test(raw)) return '/';
  let parsed;
  try {
    parsed = new URL(raw, 'http://earth-eye.invalid');
  } catch {
    return '/';
  }
  if (parsed.origin !== 'http://earth-eye.invalid') return '/';
  if (/^\/(login|logout|signup|forgot|account)(\/|$)/i.test(parsed.pathname)) return '/';
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Create the session authority for one server process.
 *
 * @param {object} options
 * @param {string|null} options.secret - SESSION_SECRET; null = random per process.
 * @param {{credentialVersion(id: string): string|null}} options.userStore
 * @param {() => number} [options.now]
 */
export function createSessionAuth({ secret, userStore, now = Date.now }) {
  const baseKey = secret ? Buffer.from(secret, 'utf8') : randomBytes(32);
  const signingKey = hmac(baseKey, 'earth-eye-session-signing');
  /** Signed-out token ids until their natural expiry (lost on restart). */
  const revoked = new Map();

  // Keyed, so a cookie never exposes an offline-guessable credential hash.
  function passwordVersion(sub) {
    const version = userStore.credentialVersion(sub);
    if (!version) return null;
    return b64url(
      hmac(signingKey, 'password-version', sub, version).subarray(0, 12),
    );
  }

  function sign(payload) {
    return b64url(hmac(signingKey, 'token', payload));
  }

  /**
   * @param {{id: string}} user
   * @param {{remember?: boolean}} [options] remember=true → 30d; false → browser session TTL
   */
  function issue(user, { remember = true } = {}) {
    const pv = passwordVersion(user.id);
    if (!pv) throw new Error('Unknown account');
    const issuedAt = now();
    const ttl = remember ? SESSION_TTL_MS : SESSION_BROWSER_TTL_MS;
    const id = b64url(randomBytes(32));
    const payload = [
      TOKEN_VERSION,
      issuedAt.toString(36),
      (issuedAt + ttl).toString(36),
      id,
      b64url(Buffer.from(user.id, 'utf8')),
      pv,
    ].join('.');
    return {
      token: `${payload}.${sign(payload)}`,
      issuedAt,
      expiresAt: issuedAt + ttl,
      id,
      remember: Boolean(remember),
    };
  }

  /** @returns {null | {id: string, sub: string, issuedAt: number, expiresAt: number}} */
  function verify(token) {
    const value = String(token || '');
    if (!value || value.length > 512) return null;
    const parts = value.split('.');
    if (parts.length !== 7 || parts[0] !== TOKEN_VERSION) return null;
    const payload = parts.slice(0, 6).join('.');
    const expected = Buffer.from(sign(payload));
    const presented = Buffer.from(parts[6]);
    if (
      expected.length !== presented.length ||
      !timingSafeEqual(expected, presented)
    )
      return null;
    const sub = Buffer.from(parts[4], 'base64url').toString('utf8');
    if (parts[5] !== passwordVersion(sub)) return null;
    const issuedAt = Number.parseInt(parts[1], 36);
    const expiresAt = Number.parseInt(parts[2], 36);
    const t = now();
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
    if (t >= expiresAt || issuedAt > t + 60_000) return null;
    if (revoked.has(parts[3])) return null;
    const remember = expiresAt - issuedAt > SESSION_BROWSER_TTL_MS;
    return { id: parts[3], sub, issuedAt, expiresAt, remember };
  }

  function revoke(session) {
    if (!session) return;
    const t = now();
    for (const [id, expiresAt] of revoked)
      if (expiresAt <= t) revoked.delete(id);
    if (revoked.size > 10_000) revoked.delete(revoked.keys().next().value);
    revoked.set(session.id, session.expiresAt);
  }

  return {
    issue,
    verify,
    revoke,
    /** Whether a still-valid session should get a fresh cookie (sliding expiry). */
    shouldReissue(session) {
      return now() - session.issuedAt >= REISSUE_AFTER_MS;
    },
    persistent: Boolean(secret),
  };
}

/**
 * @param {string} token
 * @param {{secure: boolean, remember?: boolean, maxAgeSec?: number|null}} options
 *   remember=true (default): Max-Age = 30d.
 *   remember=false: session cookie (no Max-Age) — cleared when the browser exits.
 */
export function sessionCookie(token, { secure, remember = true, maxAgeSec } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  const age =
    maxAgeSec !== undefined
      ? maxAgeSec
      : remember
        ? Math.floor(SESSION_TTL_MS / 1000)
        : null;
  if (age !== null && age !== undefined)
    parts.splice(2, 0, `Max-Age=${Math.max(0, Math.floor(age))}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearedSessionCookie({ secure }) {
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

/**
 * Short-lived signed cookie proving password succeeded but MFA is still required.
 * Does NOT grant app access — only /login/2fa may consume it.
 */
export function createMfaPendingAuth({ secret, now = Date.now }) {
  const baseKey = secret ? Buffer.from(secret, 'utf8') : randomBytes(32);
  const signingKey = hmac(baseKey, 'earth-eye-mfa-pending');
  function sign(payload) {
    return b64url(hmac(signingKey, 'mfa-token', payload));
  }
  return {
    issue({ sub, remember = true, next = '/' }) {
      const issuedAt = now();
      const expiresAt = issuedAt + MFA_PENDING_TTL_MS;
      const id = b64url(randomBytes(16));
      const payload = [
        MFA_TOKEN_VERSION,
        issuedAt.toString(36),
        expiresAt.toString(36),
        id,
        b64url(Buffer.from(String(sub), 'utf8')),
        remember ? 'r' : 's',
        b64url(Buffer.from(String(next || '/'), 'utf8')),
      ].join('.');
      return {
        token: `${payload}.${sign(payload)}`,
        issuedAt,
        expiresAt,
        remember: Boolean(remember),
        next: String(next || '/'),
      };
    },
    verify(token) {
      const value = String(token || '');
      if (!value || value.length > 1024) return null;
      const parts = value.split('.');
      if (parts.length !== 8 || parts[0] !== MFA_TOKEN_VERSION) return null;
      const payload = parts.slice(0, 7).join('.');
      const expected = Buffer.from(sign(payload));
      const presented = Buffer.from(parts[7]);
      if (
        expected.length !== presented.length ||
        !timingSafeEqual(expected, presented)
      )
        return null;
      const issuedAt = Number.parseInt(parts[1], 36);
      const expiresAt = Number.parseInt(parts[2], 36);
      const tnow = now();
      if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
      if (tnow >= expiresAt || issuedAt > tnow + 60_000) return null;
      const sub = Buffer.from(parts[4], 'base64url').toString('utf8');
      const remember = parts[5] === 'r';
      const next = Buffer.from(parts[6], 'base64url').toString('utf8') || '/';
      return { id: parts[3], sub, issuedAt, expiresAt, remember, next };
    },
  };
}

export function mfaCookie(token, { secure }) {
  return [
    `${MFA_COOKIE}=${token}`,
    'Path=/',
    `Max-Age=${Math.floor(MFA_PENDING_TTL_MS / 1000)}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearedMfaCookie({ secure }) {
  return [
    `${MFA_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

/**
 * Per-IP failed sign-in limiter: `max` failures per `windowMs`; a success
 * clears the counter. Bounded key map.
 */
export function createLoginLimiter({
  max = 10,
  windowMs = 15 * 60 * 1000,
  maxKeys = 10_000,
  now = Date.now,
} = {}) {
  const entries = new Map();
  const current = (key) => {
    const entry = entries.get(key);
    if (entry && now() >= entry.resetAt) {
      entries.delete(key);
      return null;
    }
    return entry || null;
  };
  return {
    /** @returns {{ok: true} | {ok: false, retryAfterSec: number}} */
    check(key) {
      const entry = current(key);
      if (entry && entry.count >= max)
        return {
          ok: false,
          retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now()) / 1000)),
        };
      return { ok: true };
    },
    fail(key) {
      let entry = current(key);
      if (!entry) {
        entry = { count: 0, resetAt: now() + windowMs };
        entries.set(key, entry);
      }
      entry.count += 1;
      if (entries.size > maxKeys) {
        const t = now();
        for (const [k, v] of entries) {
          if (entries.size <= maxKeys) break;
          if (t >= v.resetAt || k !== key) entries.delete(k);
        }
      }
    },
    succeed(key) {
      entries.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
}

/**
 * CSRF check for state-changing auth routes (on top of SameSite=Lax): the
 * Origin header, or failing that the Referer, must name the requested host.
 * Requests that carry neither (non-browser clients) are allowed.
 */
export function sameOriginRequest(req, normalizeHost) {
  const host = normalizeHost(req.headers.host);
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const hostOf = (value) => {
    try {
      const url = new URL(String(value));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return normalizeHost(url.host);
    } catch {
      return null;
    }
  };
  if (origin !== undefined) return Boolean(host) && hostOf(origin) === host;
  if (referer !== undefined) return Boolean(host) && hostOf(referer) === host;
  return true;
}

/** Read a small urlencoded form body. Resolves null when it is too big or malformed. */
export function readForm(req, limit = MAX_FORM_BYTES) {
  return new Promise((resolve) => {
    const type = String(req.headers['content-type'] || '').toLowerCase();
    if (!type.startsWith('application/x-www-form-urlencoded')) {
      req.resume();
      resolve(null);
      return;
    }
    if (Number(req.headers['content-length']) > limit) {
      req.resume();
      resolve(null);
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', () => {
      if (done) return;
      done = true;
      resolve(null);
    });
  });
}
