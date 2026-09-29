import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SESSION_TTL_MS, cleanEnvSecret } from './session-auth.js';

/**
 * AUTH-6: trusted-device cookie so Remember me + MFA can skip the second
 * factor on a known browser. Tokens are HMAC-signed; device ids are hashed
 * at rest in the MFA store. Optional — owner is never forced to use MFA.
 */

export const TRUST_COOKIE = 'ee_trust';
export const TRUST_TTL_MS = SESSION_TTL_MS; // 30 days

const b64url = (buffer) => Buffer.from(buffer).toString('base64url');

function hmac(key, ...parts) {
  const mac = createHmac('sha256', key);
  for (const part of parts) mac.update(String(part)).update('\0');
  return mac.digest();
}

export function hashDeviceId(deviceId) {
  return createHash('sha256')
    .update('ee-device\0')
    .update(String(deviceId))
    .digest('base64url');
}

export function createTrustAuth({ secret, now = Date.now }) {
  const material = cleanEnvSecret(secret);
  const baseKey = material
    ? Buffer.from(material, 'utf8')
    : randomBytes(32);
  const signingKey = hmac(baseKey, 'earth-eye-trust-device');
  const sign = (payload) => b64url(hmac(signingKey, 'trust', payload));

  return {
    issue({ sub, deviceId }) {
      const issuedAt = now();
      const expiresAt = issuedAt + TRUST_TTL_MS;
      const payload = [
        't1',
        issuedAt.toString(36),
        expiresAt.toString(36),
        b64url(Buffer.from(String(sub), 'utf8')),
        b64url(Buffer.from(String(deviceId), 'utf8')),
      ].join('.');
      return {
        token: `${payload}.${sign(payload)}`,
        deviceId,
        issuedAt,
        expiresAt,
      };
    },
    verify(token) {
      const value = String(token || '');
      if (!value || value.length > 512) return null;
      const parts = value.split('.');
      if (parts.length !== 6 || parts[0] !== 't1') return null;
      const payload = parts.slice(0, 5).join('.');
      const expected = Buffer.from(sign(payload));
      const presented = Buffer.from(parts[5]);
      if (
        expected.length !== presented.length ||
        !timingSafeEqual(expected, presented)
      )
        return null;
      const issuedAt = Number.parseInt(parts[1], 36);
      const expiresAt = Number.parseInt(parts[2], 36);
      const t = now();
      if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
      if (t >= expiresAt || issuedAt > t + 60_000) return null;
      return {
        sub: Buffer.from(parts[3], 'base64url').toString('utf8'),
        deviceId: Buffer.from(parts[4], 'base64url').toString('utf8'),
        issuedAt,
        expiresAt,
      };
    },
    newDeviceId() {
      return b64url(randomBytes(24));
    },
  };
}

export function trustCookie(token, { secure }) {
  return [
    `${TRUST_COOKIE}=${token}`,
    'Path=/',
    `Max-Age=${Math.floor(TRUST_TTL_MS / 1000)}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearedTrustCookie({ secure }) {
  return [
    `${TRUST_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
