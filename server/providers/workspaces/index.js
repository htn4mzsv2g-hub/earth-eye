/**
 * Connect middleware for /api/atlas/workspaces (Stage 5.2).
 * Session auth is enforced by the production host before plugins run.
 */
import {
  resolveWorkspacesDir,
  listWorkspaces,
  getWorkspace,
  saveWorkspace,
  deleteWorkspace,
} from './store.js';
import { appendAuditEvent } from '../../entitlements/auditLog.js';

function readJson(req, limit = 64_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(Object.assign(new Error('invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function createWorkspacesMiddleware({
  dir = resolveWorkspacesDir(),
} = {}) {
  return async function workspacesMiddleware(req, res) {
    // Connect mounts strip the prefix: req.url is "/" or "/:id" here.
    const raw = String(req.url || '/').split('?')[0];
    const parts = raw.replace(/^\/api\/atlas\/workspaces/, '').split('/').filter(Boolean);
    const id = parts[0] || null;

    try {
      if (req.method === 'GET' && !id) {
        return send(res, 200, listWorkspaces(dir));
      }
      if (req.method === 'GET' && id) {
        const got = getWorkspace(dir, id);
        return send(res, got.ok ? 200 : 404, got);
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        const body = await readJson(req);
        if (id) body.id = id;
        const saved = saveWorkspace(dir, body);
        if (saved.ok) {
          appendAuditEvent('workspace.save', {
            id: saved.workspace?.id,
            layerCount: saved.workspace?.layers?.length ?? 0,
          });
        }
        return send(res, saved.ok ? 200 : 400, saved);
      }
      if (req.method === 'DELETE' && id) {
        const deleted = deleteWorkspace(dir, id);
        if (deleted.ok) appendAuditEvent('workspace.delete', { id: deleted.id });
        return send(res, 200, deleted);
      }
      return send(res, 405, { ok: false, error: 'Method not allowed' });
    } catch (error) {
      return send(res, error.status || 500, {
        ok: false,
        error: String(error.message || error),
      });
    }
  };
}

export function workspacesProxy() {
  const middleware = createWorkspacesMiddleware();
  return {
    name: 'atlas-workspaces',
    configureServer(server) {
      server.middlewares.use('/api/atlas/workspaces', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/atlas/workspaces', middleware);
    },
  };
}

export {
  resolveWorkspacesDir,
  listWorkspaces,
  getWorkspace,
  saveWorkspace,
  deleteWorkspace,
} from './store.js';
