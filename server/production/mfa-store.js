import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  matchRecoveryCode,
  otpauthUri,
  verifyTotp,
} from './totp.js';
import { hashDeviceId } from './trust-device.js';

/**
 * Durable MFA store on the Option C volume (/data/auth/mfa.json).
 * TOTP secrets are AES-256-GCM encrypted with a key derived from SESSION_SECRET.
 * Recovery codes are stored as SHA-256 hashes only.
 */

function deriveKey(material) {
  return createHash('sha256')
    .update('earth-eye-mfa-v1\0')
    .update(String(material || ''))
    .digest();
}

export function encryptSecret(plaintext, keyMaterial) {
  const key = deriveKey(keyMaterial);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(blob, keyMaterial) {
  const parts = String(blob || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Bad ciphertext');
  const key = deriveKey(keyMaterial);
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const data = Buffer.from(parts[3], 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    'utf8',
  );
}

/**
 * @param {{ dataDir: string, keyMaterial: string|null, now?: () => number }} options
 */
export function createMfaStore({ dataDir, keyMaterial, now = Date.now }) {
  if (!dataDir) throw new Error('MFA dataDir required');
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'mfa.json');

  function readAll() {
    if (!existsSync(file)) return {};
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

  function writeAll(data) {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, file);
  }

  function record(userId) {
    const all = readAll();
    return all[userId] || null;
  }

  function save(userId, next) {
    const all = readAll();
    if (next == null) delete all[userId];
    else all[userId] = next;
    writeAll(all);
  }

  function requireKey() {
    if (!keyMaterial || String(keyMaterial).length < 32)
      throw new Error('SESSION_SECRET required for MFA encryption');
    return keyMaterial;
  }

  return {
    filePath: file,

    isEnabled(userId) {
      const rec = record(userId);
      return Boolean(rec?.enabled && rec?.secretEnc);
    },

    status(userId) {
      const rec = record(userId);
      return {
        enabled: Boolean(rec?.enabled && rec?.secretEnc),
        pending: Boolean(rec?.pendingSecretEnc),
        recoveryRemaining: Array.isArray(rec?.recoveryHashes)
          ? rec.recoveryHashes.length
          : 0,
      };
    },

    /**
     * Start optional enroll: store pending encrypted secret (not enabled yet).
     * @returns {{ secret: string, otpauth: string }}
     */
    beginEnroll(userId, { accountName = 'owner', issuer = 'Earth Eye' } = {}) {
      const key = requireKey();
      const secret = generateTotpSecret();
      const prev = record(userId) || {};
      save(userId, {
        ...prev,
        pendingSecretEnc: encryptSecret(secret, key),
        pendingAt: now(),
        // keep existing enabled secret until confirm
      });
      return {
        secret,
        otpauth: otpauthUri({ secret, accountName, issuer }),
      };
    },

    cancelEnroll(userId) {
      const prev = record(userId);
      if (!prev?.pendingSecretEnc) return;
      const { pendingSecretEnc: _p, pendingAt: _a, ...rest } = prev;
      save(userId, Object.keys(rest).length ? rest : null);
    },

    /** Re-read pending secret for enroll UI (still not enabled). */
    peekPending(userId) {
      const key = requireKey();
      const prev = record(userId);
      if (!prev?.pendingSecretEnc) return null;
      try {
        const secret = decryptSecret(prev.pendingSecretEnc, key);
        return {
          secret,
          otpauth: otpauthUri({
            secret,
            accountName: 'owner',
            issuer: 'Earth Eye',
          }),
        };
      } catch {
        return null;
      }
    },

    /**
     * Verify TOTP against pending secret, then enable + return recovery codes once.
     * @returns {{ ok: true, recoveryCodes: string[] } | { ok: false, error: string }}
     */
    confirmEnroll(userId, code) {
      const key = requireKey();
      const prev = record(userId);
      if (!prev?.pendingSecretEnc)
        return { ok: false, error: 'No enrollment in progress.' };
      let secret;
      try {
        secret = decryptSecret(prev.pendingSecretEnc, key);
      } catch {
        return { ok: false, error: 'Could not read pending secret.' };
      }
      if (!verifyTotp(secret, code, { atMs: now() }))
        return { ok: false, error: 'Invalid authenticator code.' };
      const recoveryCodes = generateRecoveryCodes(10);
      save(userId, {
        enabled: true,
        secretEnc: encryptSecret(secret, key),
        recoveryHashes: recoveryCodes.map(hashRecoveryCode),
        enabledAt: now(),
      });
      return { ok: true, recoveryCodes };
    },

    /**
     * Verify login factor (TOTP or recovery). Consumes a matching recovery code.
     * @returns {{ ok: true, via: 'totp'|'recovery' } | { ok: false }}
     */
    verifyLogin(userId, code) {
      const key = requireKey();
      const prev = record(userId);
      if (!prev?.enabled || !prev?.secretEnc) return { ok: false };
      const trimmed = String(code ?? '').trim();
      let secret;
      try {
        secret = decryptSecret(prev.secretEnc, key);
      } catch {
        return { ok: false };
      }
      if (/^\d{6}$/.test(trimmed.replace(/\s+/g, ''))) {
        if (verifyTotp(secret, trimmed, { atMs: now() }))
          return { ok: true, via: 'totp' };
      }
      const idx = matchRecoveryCode(trimmed, prev.recoveryHashes || []);
      if (idx >= 0) {
        const nextHashes = prev.recoveryHashes.filter((_, i) => i !== idx);
        save(userId, { ...prev, recoveryHashes: nextHashes });
        return { ok: true, via: 'recovery' };
      }
      return { ok: false };
    },

    /**
     * Disable MFA after a valid TOTP (or last recovery) check.
     */
    disable(userId, code) {
      const check = this.verifyLogin(userId, code);
      if (!check.ok) return { ok: false, error: 'Invalid authenticator code.' };
      save(userId, null);
      return { ok: true };
    },

    /** AUTH-6: record a trusted device (hashed id) after MFA + Remember me. */
    rememberDevice(userId, deviceId, { label = 'Browser', ttlMs = 30 * 24 * 60 * 60 * 1000 } = {}) {
      const prev = record(userId);
      if (!prev?.enabled) return { ok: false };
      const idHash = hashDeviceId(deviceId);
      const devices = Array.isArray(prev.trustedDevices)
        ? prev.trustedDevices.filter((d) => d.expiresAt > now())
        : [];
      const next = devices.filter((d) => d.idHash !== idHash);
      next.push({
        idHash,
        label: String(label).slice(0, 64),
        createdAt: now(),
        expiresAt: now() + ttlMs,
      });
      // Cap at 10 devices.
      while (next.length > 10) next.shift();
      save(userId, { ...prev, trustedDevices: next });
      return { ok: true };
    },

    isTrustedDevice(userId, deviceId) {
      const prev = record(userId);
      if (!prev?.enabled || !deviceId) return false;
      const idHash = hashDeviceId(deviceId);
      const devices = Array.isArray(prev.trustedDevices)
        ? prev.trustedDevices
        : [];
      return devices.some((d) => d.idHash === idHash && d.expiresAt > now());
    },

    listTrustedDevices(userId) {
      const prev = record(userId);
      const devices = Array.isArray(prev?.trustedDevices)
        ? prev.trustedDevices.filter((d) => d.expiresAt > now())
        : [];
      return devices.map(({ label, createdAt, expiresAt }) => ({
        label,
        createdAt,
        expiresAt,
      }));
    },

    revokeTrustedDevices(userId) {
      const prev = record(userId);
      if (!prev) return;
      save(userId, { ...prev, trustedDevices: [] });
    },

    /** AUTH-8: durable session generation — bump invalidates other ee_session cookies. */
    getSessionEpoch(userId) {
      const prev = record(userId);
      const n = Number(prev?.sessionEpoch);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    },

    bumpSessionEpoch(userId) {
      const prev = record(userId) || {};
      const next = (Number(prev.sessionEpoch) || 0) + 1;
      save(userId, {
        ...prev,
        sessionEpoch: next,
        trustedDevices: [],
        epochBumpedAt: now(),
      });
      return next;
    },
  };
}

/** Resolve durable MFA dir: prefer volume, else local fallback for tests. */
export function resolveMfaDataDir(env = process.env) {
  const fromEnv = String(env.EE_AUTH_DATA_DIR || '').trim();
  if (fromEnv) return fromEnv;
  const collection = String(env.EE_COLLECTION_DATA_DIR || '').trim();
  if (collection)
    return path.join(path.dirname(collection), 'auth');
  if (existsSync('/data')) return '/data/auth';
  return path.join(process.cwd(), '.gev-cache', 'auth');
}
