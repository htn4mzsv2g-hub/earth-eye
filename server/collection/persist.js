/**
 * File-backed checkpoints for collection (Option C volume).
 * Writes under EE_COLLECTION_DATA_DIR (default /data/collection on Fly).
 * Idempotent; never throws into the scheduler — failures are logged as health notes.
 */
import fs from 'node:fs';
import path from 'node:path';

export function resolveDataDir(env = process.env) {
  const raw = String(env.EE_COLLECTION_DATA_DIR || '').trim();
  return raw || null;
}

export function continuousEnabled(env = process.env) {
  return env.EE_COLLECTION_CONTINUOUS === '1';
}

/**
 * @param {string|null} dataDir
 * @returns {{ ready: boolean, path: string|null, error: string|null }}
 */
export function ensureDataDir(dataDir) {
  if (!dataDir)
    return { ready: false, path: null, error: 'no data dir configured' };
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const probe = path.join(dataDir, '.write-probe');
    fs.writeFileSync(probe, String(Date.now()));
    fs.unlinkSync(probe);
    return { ready: true, path: dataDir, error: null };
  } catch (error) {
    return {
      ready: false,
      path: dataDir,
      error: String(error?.message || error),
    };
  }
}

export function checkpointPath(dataDir, feedId) {
  const safe = String(feedId || 'unknown').replace(/[^a-z0-9._-]+/gi, '_');
  return path.join(dataDir, `${safe}.json`);
}

export function healthPath(dataDir) {
  return path.join(dataDir, '_health.json');
}

/** Load one feed's records map from disk (best effort). */
export function loadFeed(dataDir, feedId) {
  if (!dataDir) return null;
  try {
    const raw = fs.readFileSync(checkpointPath(dataDir, feedId), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const records = Array.isArray(parsed.records) ? parsed.records : [];
    return {
      feedId,
      savedAt: parsed.savedAt || null,
      records,
    };
  } catch {
    return null;
  }
}

/** Persist one feed (atomic replace). */
export function saveFeed(dataDir, feedId, records) {
  if (!dataDir) return { ok: false, error: 'no data dir' };
  try {
    const file = checkpointPath(dataDir, feedId);
    const tmp = `${file}.tmp`;
    const body = JSON.stringify({
      feedId,
      savedAt: Date.now(),
      records: records.slice(0, 5000),
    });
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, file);
    return { ok: true, bytes: Buffer.byteLength(body) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

export function saveHealthIndex(dataDir, healthRows) {
  if (!dataDir) return { ok: false };
  try {
    const file = healthPath(dataDir);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({ savedAt: Date.now(), health: healthRows }),
    );
    fs.renameSync(tmp, file);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

export function loadHealthIndex(dataDir) {
  if (!dataDir) return null;
  try {
    return JSON.parse(fs.readFileSync(healthPath(dataDir), 'utf8'));
  } catch {
    return null;
  }
}
