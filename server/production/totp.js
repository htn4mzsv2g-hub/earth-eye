import {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * RFC 6238 TOTP (SHA-1, 30s, 6 digits) + recovery codes.
 * Pure node:crypto — no OAuth, no external IdP.
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20) {
  const buf = randomBytes(bytes);
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    const slice = bits.slice(i, i + 5);
    if (slice.length < 5) break;
    out += BASE32[Number.parseInt(slice, 2)];
  }
  return out;
}

export function decodeBase32(secret) {
  const cleaned = String(secret || '')
    .toUpperCase()
    .replace(/=+$/u, '')
    .replace(/[^A-Z2-7]/gu, '');
  let bits = '';
  for (const ch of cleaned) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secretBuf, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secretBuf).update(msg).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function generateTotpCode(secret, atMs = Date.now(), stepSec = 30) {
  const counter = Math.floor(atMs / 1000 / stepSec);
  return hotp(decodeBase32(secret), counter);
}

/**
 * Constant-ish verify across a small window (±1 by default).
 * @returns {boolean}
 */
export function verifyTotp(
  secret,
  code,
  { atMs = Date.now(), window = 1, stepSec = 30 } = {},
) {
  const presented = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(presented)) return false;
  const secretBuf = decodeBase32(secret);
  if (secretBuf.length < 10) return false;
  const counter = Math.floor(atMs / 1000 / stepSec);
  let ok = false;
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secretBuf, counter + w);
    const a = Buffer.from(expected);
    const b = Buffer.from(presented);
    if (a.length === b.length && timingSafeEqual(a, b)) ok = true;
  }
  return ok;
}

export function otpauthUri({
  secret,
  accountName = 'owner',
  issuer = 'Earth Eye',
}) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: String(secret).replace(/\s+/g, ''),
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** 10 one-time recovery codes (xxxx-xxxx), shown once at enroll confirm. */
export function generateRecoveryCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString('hex');
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export function hashRecoveryCode(code) {
  const normalized = String(code ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  return createHash('sha256')
    .update('ee-recovery\0')
    .update(normalized)
    .digest('base64url');
}

/**
 * @returns {number} index of matching hash, or -1
 */
export function matchRecoveryCode(code, hashes) {
  const target = hashRecoveryCode(code);
  const targetBuf = Buffer.from(target);
  let found = -1;
  const list = Array.isArray(hashes) ? hashes : [];
  for (let i = 0; i < list.length; i++) {
    const h = Buffer.from(String(list[i]));
    if (h.length === targetBuf.length && timingSafeEqual(h, targetBuf))
      found = i;
  }
  return found;
}
