/**
 * Stage 5.2 — Saved workspaces (owner admin, volume-backed).
 * Persists under EE_WORKSPACES_DIR or sibling of EE_COLLECTION_DATA_DIR.
 * Never invents observations; stores only UI state the owner chose.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const WORKSPACE_VERSION = 1;
export const MAX_WORKSPACES = 40;
export const MAX_NAME_LEN = 80;

export function resolveWorkspacesDir(env = process.env) {
  const explicit = String(env.EE_WORKSPACES_DIR || '').trim();
  if (explicit) return explicit;
  const collection = String(env.EE_COLLECTION_DATA_DIR || '').trim();
  if (collection) return path.join(path.dirname(collection), 'workspaces');
  return path.join(process.cwd(), '.gev-cache', 'workspaces');
}

export function ensureWorkspacesDir(dir) {
  if (!dir) return { ready: false, error: 'no workspaces dir' };
  try {
    fs.mkdirSync(dir, { recursive: true });
    return { ready: true, error: null };
  } catch (error) {
    return { ready: false, error: String(error?.message || error) };
  }
}

function indexPath(dir) {
  return path.join(dir, '_index.json');
}

function readIndex(dir) {
  try {
    const raw = fs.readFileSync(indexPath(dir), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.workspaces) ? parsed.workspaces : [];
  } catch {
    return [];
  }
}

function writeIndex(dir, workspaces) {
  const file = indexPath(dir);
  const tmp = `${file}.tmp`;
  const body = JSON.stringify(
    { version: WORKSPACE_VERSION, updatedAt: new Date().toISOString(), workspaces },
    null,
    0,
  );
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
}

function sanitizeLayers(layers) {
  if (!Array.isArray(layers)) return [];
  return [
    ...new Set(
      layers
        .map((id) => String(id || '').trim())
        .filter((id) => /^[a-z0-9-]{1,64}$/.test(id)),
    ),
  ].slice(0, 64);
}

function sanitizeCamera(camera) {
  if (!camera || typeof camera !== 'object') return null;
  const lat = Number(camera.latitude ?? camera.lat);
  const lon = Number(camera.longitude ?? camera.lon);
  const height = Number(camera.height ?? camera.heightM);
  const heading = Number(camera.heading);
  const pitch = Number(camera.pitch);
  if (![lat, lon].every(Number.isFinite)) return null;
  return {
    latitude: lat,
    longitude: lon,
    height: Number.isFinite(height) ? height : null,
    heading: Number.isFinite(heading) ? heading : null,
    pitch: Number.isFinite(pitch) ? pitch : null,
  };
}

/** List saved workspaces (metadata only). */
export function listWorkspaces(dir) {
  const { ready, error } = ensureWorkspacesDir(dir);
  if (!ready) return { ok: false, error, workspaces: [] };
  return { ok: true, workspaces: readIndex(dir) };
}

/** Load one workspace document. */
export function getWorkspace(dir, id) {
  const safe = String(id || '').replace(/[^a-z0-9_-]+/gi, '');
  if (!safe) return { ok: false, error: 'invalid id' };
  try {
    const raw = fs.readFileSync(path.join(dir, `${safe}.json`), 'utf8');
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object') return { ok: false, error: 'corrupt' };
    return { ok: true, workspace: doc };
  } catch {
    return { ok: false, error: 'not found' };
  }
}

/**
 * Create or replace a workspace.
 * @param {string} dir
 * @param {object} input
 */
export function saveWorkspace(dir, input = {}) {
  const { ready, error } = ensureWorkspacesDir(dir);
  if (!ready) return { ok: false, error };
  const index = readIndex(dir);
  if (!input.id && index.length >= MAX_WORKSPACES)
    return { ok: false, error: `At most ${MAX_WORKSPACES} workspaces` };

  const id =
    String(input.id || '')
      .replace(/[^a-z0-9_-]+/gi, '')
      .slice(0, 40) || randomUUID().slice(0, 8);
  const name = String(input.name || 'Untitled')
    .trim()
    .slice(0, MAX_NAME_LEN) || 'Untitled';
  const now = new Date().toISOString();
  const existing = index.find((w) => w.id === id);
  const doc = {
    version: WORKSPACE_VERSION,
    id,
    name,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    layers: sanitizeLayers(input.layers),
    camera: sanitizeCamera(input.camera),
    notes: String(input.notes || '')
      .trim()
      .slice(0, 500),
    // Explicit: saved UI state is not a retained observation archive.
    retainsObservations: false,
  };
  const file = path.join(dir, `${id}.json`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc));
  fs.renameSync(tmp, file);

  const meta = {
    id: doc.id,
    name: doc.name,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
    layerCount: doc.layers.length,
    hasCamera: Boolean(doc.camera),
  };
  const next = [meta, ...index.filter((w) => w.id !== id)].slice(0, MAX_WORKSPACES);
  writeIndex(dir, next);
  return { ok: true, workspace: doc };
}

export function deleteWorkspace(dir, id) {
  const safe = String(id || '').replace(/[^a-z0-9_-]+/gi, '');
  if (!safe) return { ok: false, error: 'invalid id' };
  const { ready, error } = ensureWorkspacesDir(dir);
  if (!ready) return { ok: false, error };
  try {
    fs.unlinkSync(path.join(dir, `${safe}.json`));
  } catch {
    /* missing is fine */
  }
  writeIndex(
    dir,
    readIndex(dir).filter((w) => w.id !== safe),
  );
  return { ok: true, id: safe };
}
