import { createHash, timingSafeEqual } from 'node:crypto';
import { resolveLoginConfig, resolveReviewerConfig } from './session-auth.js';

/**
 * Request policy for the public production server: security headers, client
 * identification, the optional host allowlist and login gates, and per-IP
 * rate limiting. Pure functions over `node:http` requests so each gate is
 * unit-testable in isolation.
 */

/** Paths whose upstream bills per request (Google Places, OpenAI). */
export const METERED_API_PREFIXES = Object.freeze([
  '/api/google/',
  '/api/openai/',
  '/api/realtime/token',
]);

const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
const nonEmpty = (value) => String(value ?? '').trim() !== '';

function nonNegativeInt(value, fallback, name) {
  if (!nonEmpty(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

/** Normalize `Host` values: lowercase, no port, no trailing dot. */
export function normalizeHost(value) {
  let host = String(value ?? '')
    .trim()
    .toLowerCase();
  if (host.startsWith('[')) host = host.slice(0, host.indexOf(']') + 1);
  else host = host.replace(/:\d+$/, '');
  return host.replace(/\.$/, '');
}

/**
 * Resolve production configuration from environment variables. Every gate is
 * OFF unless its variable is set; misconfigured pairs fail loudly at boot
 * rather than silently running without the protection the operator asked for.
 */
export function resolveProductionConfig(env = process.env) {
  const onFly = nonEmpty(env.FLY_APP_NAME);
  const login = resolveLoginConfig(env);
  const reviewer = resolveReviewerConfig(env);
  if (reviewer && !login)
    throw new Error('REVIEWER_USER/REVIEWER_PASS require LOGIN_USER/LOGIN_PASS (auth mode)');
  const originHeader = String(env.ORIGIN_AUTH_HEADER ?? '')
    .trim()
    .toLowerCase();
  const originSecret = String(env.ORIGIN_AUTH_SECRET ?? '');
  if (nonEmpty(originHeader) !== nonEmpty(originSecret))
    throw new Error(
      'ORIGIN_AUTH_HEADER and ORIGIN_AUTH_SECRET must be set together',
    );
  const allowedHosts = String(env.ALLOWED_HOSTS ?? '')
    .split(',')
    .map(normalizeHost)
    .filter(Boolean);
  const action = String(env.ALLOWED_HOSTS_ACTION || 'redirect')
    .trim()
    .toLowerCase();
  if (!['redirect', 'reject'].includes(action))
    throw new Error('ALLOWED_HOSTS_ACTION must be "redirect" or "reject"');
  const trustProxy = nonEmpty(env.TRUST_PROXY)
    ? truthy(env.TRUST_PROXY)
    : onFly;
  const clientIpHeader = nonEmpty(env.TRUST_PROXY_HEADER)
    ? String(env.TRUST_PROXY_HEADER).trim().toLowerCase()
    : onFly
      ? 'fly-client-ip'
      : '';
  return Object.freeze({
    port: nonNegativeInt(env.PORT, 8080, 'PORT'),
    host: nonEmpty(env.HOST) ? String(env.HOST).trim() : '0.0.0.0',
    production: env.NODE_ENV === 'production' || onFly,
    trustProxy,
    clientIpHeader: trustProxy ? clientIpHeader : '',
    allowedHosts,
    allowedHostsAction: action,
    /** In-app sign-in (session cookie); null = open. See session-auth.js. */
    login,
    /** Optional second env account for critique; null when unset. */
    reviewer,
    originAuth: nonEmpty(originHeader)
      ? { header: originHeader, secret: originSecret }
      : null,
    rateLimitApiPerMin: nonNegativeInt(
      env.RATE_LIMIT_API_PER_MIN,
      1200,
      'RATE_LIMIT_API_PER_MIN',
    ),
    rateLimitMeteredPerMin: nonNegativeInt(
      env.RATE_LIMIT_METERED_PER_MIN,
      20,
      'RATE_LIMIT_METERED_PER_MIN',
    ),
    maxBodyBytes: nonNegativeInt(
      env.API_MAX_BODY_BYTES,
      1024 * 1024,
      'API_MAX_BODY_BYTES',
    ),
    realtimeDebugLog: truthy(env.REALTIME_DEBUG_LOG),
    shutdownGraceMs: nonNegativeInt(
      env.SHUTDOWN_GRACE_MS,
      8000,
      'SHUTDOWN_GRACE_MS',
    ),
  });
}

/** Whether the client reached us over HTTPS (directly, or via a trusted proxy). */
export function isHttpsRequest(req, { trustProxy = false } = {}) {
  if (req.socket?.encrypted) return true;
  if (!trustProxy) return false;
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return proto === 'https';
}

/**
 * Headers on every response. Framing policy is the repository's existing one
 * (build/vite.js server.headers): DENY + frame-ancestors 'none' — never
 * loosened. HSTS only for HTTPS requests in production, so plain-HTTP local
 * runs are never pinned. Referrer-Policy keeps the origin on cross-origin
 * requests because the referrer-restricted Google Maps key depends on it.
 */
export function applySecurityHeaders(req, res, config) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (config.production && isHttpsRequest(req, config))
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

/**
 * Client key for rate limiting. Without a trusted proxy this is the socket
 * peer. Behind Fly the peer is always Fly's proxy, so the Fly-set
 * `Fly-Client-IP` header is used instead (Fly overwrites it; a client cannot
 * forge it through the proxy). Never trusts X-Forwarded-For.
 */
export function clientAddress(req, { clientIpHeader = '' } = {}) {
  if (clientIpHeader) {
    const value = String(req.headers[clientIpHeader] || '')
      .split(',')[0]
      .trim();
    if (value) return value;
  }
  return String(req.socket?.remoteAddress || 'unknown');
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

/** Constant-time string comparison (hashing first equalizes lengths). */
export function safeEqual(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Fixed-window per-key limiter. O(1) per request; the key map is bounded so a
 * caller rotating addresses cannot grow memory without limit.
 */
export function createFixedWindowLimiter({
  max,
  windowMs = 60_000,
  maxKeys = 10_000,
  now = Date.now,
}) {
  const windows = new Map();
  return {
    /** @returns {{ok: true} | {ok: false, retryAfterSec: number}} */
    check(key) {
      if (!max) return { ok: true };
      const t = now();
      let entry = windows.get(key);
      if (!entry || t >= entry.resetAt) {
        entry = { count: 0, resetAt: t + windowMs };
        windows.delete(key);
        windows.set(key, entry);
      }
      entry.count += 1;
      if (windows.size > maxKeys) {
        for (const [k, v] of windows) {
          if (windows.size <= maxKeys) break;
          if (t >= v.resetAt || k !== key) windows.delete(k);
        }
      }
      if (entry.count > max)
        return {
          ok: false,
          retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)),
        };
      return { ok: true };
    },
    get size() {
      return windows.size;
    },
  };
}

export function isMeteredApiPath(pathname) {
  return METERED_API_PREFIXES.some((prefix) =>
    prefix.endsWith('/')
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
