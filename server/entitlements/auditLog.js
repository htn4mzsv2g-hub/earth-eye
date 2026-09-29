/**
 * Stage 5.4 — append-only owner audit log (no secrets, no passwords).
 * Persists under EE_AUDIT_LOG_DIR or sibling of collection/workspaces volume.
 * Entries are JSONL; values are redacted for known secret-shaped keys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const AUDIT_VERSION = 1;
export const MAX_AUDIT_LINES_READ = 200;
export const MAX_AUDIT_FILE_BYTES = 2 * 1024 * 1024;

const SECRET_KEY =
  /pass(word)?|secret|token|api[_-]?key|authorization|cookie|credential/i;

export function resolveAuditLogDir(env = process.env) {
  const explicit = String(env.EE_AUDIT_LOG_DIR || '').trim();
  if (explicit) return explicit;
  const collection = String(env.EE_COLLECTION_DATA_DIR || '').trim();
  if (collection) return path.join(path.dirname(collection), 'audit');
  return path.join(process.cwd(), '.gev-cache', 'audit');
}

export function auditLogPath(dir = resolveAuditLogDir()) {
  return path.join(dir, 'owner-audit.jsonl');
}

/** Redact object values whose keys look like secrets. Never stores raw secrets. */
export function sanitizeAuditDetails(details = {}) {
  if (!details || typeof details !== 'object' || Array.isArray(details))
    return {};
  const out = {};
  for (const [k, v] of Object.entries(details)) {
    if (SECRET_KEY.test(k)) {
      out[k] = '[redacted]';
      continue;
    }
    if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null)
      out[k] = v;
    else if (Array.isArray(v))
      out[k] = v.slice(0, 20).map((x) => (typeof x === 'string' ? x.slice(0, 80) : x));
    else out[k] = '[object]';
  }
  return out;
}

/** Stable non-reversible client tag (not a password hash). */
export function clientTag(ipOrKey) {
  const raw = String(ipOrKey || '').trim() || 'unknown';
  return createHash('sha256').update(`ee-audit\0${raw}`).digest('hex').slice(0, 12);
}

/**
 * @param {string} action e.g. auth.login.ok | workspace.save | owner.summary
 * @param {object} [details]
 */
export function appendAuditEvent(
  action,
  details = {},
  { dir = resolveAuditLogDir(), now = () => new Date().toISOString() } = {},
) {
  const safeAction = String(action || '')
    .trim()
    .slice(0, 80);
  if (!safeAction) return { ok: false, error: 'missing action' };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = auditLogPath(dir);
    const line =
      JSON.stringify({
        v: AUDIT_VERSION,
        at: now(),
        action: safeAction,
        details: sanitizeAuditDetails(details),
      }) + '\n';
    fs.appendFileSync(file, line, { mode: 0o600 });
    // Bound file growth: if oversized, rotate to .1 (keep one generation).
    try {
      const st = fs.statSync(file);
      if (st.size > MAX_AUDIT_FILE_BYTES) {
        const rotated = `${file}.1`;
        try {
          fs.unlinkSync(rotated);
        } catch {
          /* */
        }
        fs.renameSync(file, rotated);
      }
    } catch {
      /* ignore rotate errors */
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

/** Read newest audit lines (owner admin). Never invents events. */
export function readAuditEvents({
  dir = resolveAuditLogDir(),
  limit = 50,
} = {}) {
  const file = auditLogPath(dir);
  const capped = Math.min(MAX_AUDIT_LINES_READ, Math.max(1, Number(limit) || 50));
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const slice = lines.slice(-capped);
    const events = [];
    for (const line of slice) {
      try {
        const row = JSON.parse(line);
        if (row && typeof row.action === 'string') events.push(row);
      } catch {
        /* skip corrupt */
      }
    }
    return {
      ok: true,
      events: events.reverse(),
      count: events.length,
      note: events.length ? undefined : 'No audit events recorded yet.',
    };
  } catch (error) {
    if (error?.code === 'ENOENT')
      return { ok: true, events: [], count: 0, note: 'No audit log file yet.' };
    return { ok: false, error: String(error?.message || error), events: [] };
  }
}
