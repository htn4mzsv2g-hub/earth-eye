#!/usr/bin/env node
/**
 * QA-only helper for running `npm run test:track` against a PRODUCTION build
 * (`npm start`), which — correctly — serves no /src or /node_modules routes.
 *
 * The tracking harness imports two pure helper modules straight from source
 * (`--source-base`, default /src, which only the Vite dev server answers).
 * This serves `src/**.js` from a separate loopback port, bundled on request
 * with esbuild (Vite's own dependency) and with `cesium` bound to the page's
 * `window.Cesium` global, i.e. the SAME Cesium instance the production app
 * runs. The app page, its assets and every /api request still go to the
 * production server; nothing here is a Vite server and nothing here ships.
 *
 *   node scripts/qa-harness-source-server.mjs [--port 5174]
 *   npm run test:track -- --url http://localhost:4173 \
 *     --source-base http://127.0.0.1:5174/src
 */
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const portArg = process.argv.indexOf('--port');
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 5174;

const cesiumGlobal = {
  name: 'cesium-global',
  setup(b) {
    b.onResolve({ filter: /^cesium$/ }, () => ({
      path: 'cesium',
      namespace: 'cesium-global',
    }));
    b.onLoad({ filter: /.*/, namespace: 'cesium-global' }, () => ({
      contents: 'module.exports = globalThis.Cesium;',
      loader: 'js',
    }));
  },
};

http
  .createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url, 'http://x');
    const rel = path.posix.normalize(decodeURIComponent(url.pathname));
    const file = path.join(root, rel);
    if (
      !rel.startsWith('/src/') ||
      !rel.endsWith('.js') ||
      !file.startsWith(path.join(root, 'src') + path.sep) ||
      !existsSync(file)
    ) {
      res.statusCode = 404;
      return res.end('not found');
    }
    try {
      const out = await build({
        entryPoints: [file],
        bundle: true,
        format: 'esm',
        write: false,
        platform: 'browser',
        plugins: [cesiumGlobal],
        logLevel: 'silent',
      });
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(out.outputFiles[0].text);
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error?.message || error));
    }
  })
  .listen(port, '127.0.0.1', () =>
    console.log(`[qa-source] serving bundled src/ on http://127.0.0.1:${port}/src`),
  );
