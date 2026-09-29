import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Apply the same dotenv ladder Vite's loadEnv reads (lowest to highest
 * precedence: .env, .env.local, .env.<mode>, .env.<mode>.local) without a
 * dependency. Real environment variables always win, exactly as in
 * server/standalone/vite.config.js, so Fly secrets override any file. In the
 * container image these files do not exist (.dockerignore excludes them).
 *
 * @returns {string[]} Names of the files that were read (never values).
 */
export function loadDotenvLadder(root, mode = 'production', env = process.env) {
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`];
  const merged = {};
  const loaded = [];
  for (const name of files) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    Object.assign(merged, parseEnv(readFileSync(file, 'utf8')));
    loaded.push(name);
  }
  for (const [key, value] of Object.entries(merged)) {
    if (env[key] === undefined) env[key] = value;
  }
  return loaded;
}
