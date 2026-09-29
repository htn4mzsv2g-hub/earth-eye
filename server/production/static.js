import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

/** Content types for every extension the production build emits (and a few more). */
export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.geojsonl': 'application/geo+json-seq; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ktx2': 'image/ktx2',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pbf': 'application/x-protobuf',
  '.bin': 'application/octet-stream',
});

const COMPRESSIBLE =
  /^(?:text\/|image\/svg\+xml|application\/(?:json|manifest\+json|geo\+json|geo\+json-seq|xml|wasm)|model\/gltf\+json)/;
const MIN_COMPRESS_BYTES = 1024;
/** Vite fingerprints everything it emits under /assets/ with a content hash. */
const HASHED_ASSET = /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i;

export function contentTypeFor(file) {
  return (
    MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
  );
}

/**
 * Cache policy: fingerprinted build output is immutable for a year; HTML is
 * always revalidated so a deploy is picked up on the next load; everything
 * else (public/ files and the unhashed Cesium runtime) is cached briefly and
 * revalidated with the ETag.
 */
export function cacheControlFor(urlPath) {
  if (urlPath.endsWith('.html')) return 'no-cache';
  if (HASHED_ASSET.test(urlPath)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

/** Pick br > gzip from an Accept-Encoding header, honoring q=0. */
export function negotiateEncoding(header) {
  const accepted = new Map();
  for (const part of String(header || '').split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    const q = params
      .map((param) => param.trim())
      .find((param) => param.startsWith('q='));
    accepted.set(name, q ? Number(q.slice(2)) : 1);
  }
  const q = (name) =>
    accepted.has(name) ? accepted.get(name) : (accepted.get('*') ?? 0);
  if (q('br') > 0) return 'br';
  if (q('gzip') > 0) return 'gzip';
  return null;
}

/** Byte-budgeted LRU for compressed static bodies (build output never changes at runtime). */
function createByteLru(maxBytes) {
  const entries = new Map();
  let bytes = 0;
  return {
    get(key) {
      const value = entries.get(key);
      if (value) {
        entries.delete(key);
        entries.set(key, value);
      }
      return value;
    },
    set(key, value) {
      if (value.length > maxBytes) return;
      if (entries.has(key)) {
        bytes -= entries.get(key).length;
        entries.delete(key);
      }
      entries.set(key, value);
      bytes += value.length;
      for (const [oldKey, oldValue] of entries) {
        if (bytes <= maxBytes) break;
        entries.delete(oldKey);
        bytes -= oldValue.length;
      }
    },
    get bytes() {
      return bytes;
    },
  };
}

/**
 * Serve the Vite `dist/` directory.
 *
 * @param {object} options
 * @param {string} options.root - Absolute path of the build output.
 * @param {boolean} [options.spaFallback=true] - Answer extension-less HTML
 *   navigations that match no file with index.html (what `vite preview` does).
 * @param {number} [options.compressionCacheBytes] - Memory budget for
 *   compressed bodies.
 * @param {number} [options.maxCompressBytes] - Larger files are sent as-is.
 * @param {boolean} [options.privateCache=false] - Behind a login: mark
 *   cacheable responses `private` so no shared cache stores them.
 */
export function createStaticHandler({
  root,
  spaFallback = true,
  compressionCacheBytes = 48 * 1024 * 1024,
  maxCompressBytes = 12 * 1024 * 1024,
  privateCache = false,
} = {}) {
  const base = path.resolve(root);
  const cache = createByteLru(compressionCacheBytes);
  const inflight = new Map();

  async function compressed(file, etag, encoding) {
    const key = `${file}\0${etag}\0${encoding}`;
    const hit = cache.get(key);
    if (hit) return hit;
    if (inflight.has(key)) return inflight.get(key);
    const work = (async () => {
      const raw = await readFile(file);
      const body =
        encoding === 'br'
          ? await brotli(raw, {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
              },
            })
          : await gzip(raw, { level: 6 });
      cache.set(key, body);
      return body;
    })();
    inflight.set(key, work);
    try {
      return await work;
    } finally {
      inflight.delete(key);
    }
  }

  async function resolveFile(urlPath) {
    const relative = path.posix.normalize(urlPath);
    if (relative.split('/').some((segment) => segment.startsWith('.')))
      return null;
    const absolute = path.join(base, relative);
    if (absolute !== base && !absolute.startsWith(base + path.sep)) return null;
    try {
      const info = await stat(absolute);
      if (info.isFile()) return { file: absolute, info, urlPath: relative };
      if (info.isDirectory()) {
        const index = path.join(absolute, 'index.html');
        const indexInfo = await stat(index).catch(() => null);
        if (indexInfo?.isFile())
          return {
            file: index,
            info: indexInfo,
            urlPath: path.posix.join(relative, 'index.html'),
          };
      }
    } catch {
      /* missing: fall through */
    }
    return null;
  }

  async function send(req, res, found, status = 200) {
    const { file, info, urlPath } = found;
    const type = contentTypeFor(file);
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const compressible =
      COMPRESSIBLE.test(type) &&
      info.size >= MIN_COMPRESS_BYTES &&
      info.size <= maxCompressBytes;
    res.setHeader('Content-Type', type);
    const cacheControl = cacheControlFor(urlPath);
    res.setHeader(
      'Cache-Control',
      privateCache
        ? cacheControl.replace(/^public\b/, 'private')
        : cacheControl,
    );
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', info.mtime.toUTCString());
    if (compressible) res.setHeader('Vary', 'Accept-Encoding');
    const match = String(req.headers['if-none-match'] || '');
    if (
      status === 200 &&
      match &&
      match.split(',').some((tag) => tag.trim() === etag || tag.trim() === '*')
    ) {
      res.statusCode = 304;
      res.end();
      return;
    }
    const encoding = compressible
      ? negotiateEncoding(req.headers['accept-encoding'])
      : null;
    res.statusCode = status;
    if (encoding) {
      const body = await compressed(file, etag, encoding);
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Content-Length', body.length);
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    res.setHeader('Content-Length', info.size);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    await new Promise((resolve) => {
      const stream = createReadStream(file);
      stream.on('error', () => {
        res.destroy();
        resolve();
      });
      res.on('close', () => {
        stream.destroy();
        resolve();
      });
      stream.pipe(res);
    });
  }

  function notFound(res) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end('Not found');
  }

  const handler = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Method not allowed');
      return;
    }
    const raw = String(req.url || '/').split('?')[0];
    let urlPath;
    try {
      urlPath = decodeURIComponent(raw);
    } catch {
      res.statusCode = 400;
      res.end('Bad request');
      return;
    }
    if (urlPath.includes('\0') || urlPath.includes('\\')) return notFound(res);
    const found = await resolveFile(urlPath);
    if (found) return send(req, res, found);
    const lastSegment = urlPath.split('/').pop() || '';
    const accept = String(req.headers.accept || '');
    if (
      spaFallback &&
      !lastSegment.includes('.') &&
      (accept.includes('text/html') || accept.includes('*/*'))
    ) {
      const index = await resolveFile('/index.html');
      if (index) return send(req, res, index);
    }
    return notFound(res);
  };
  handler.cacheBytes = () => cache.bytes;
  return handler;
}
