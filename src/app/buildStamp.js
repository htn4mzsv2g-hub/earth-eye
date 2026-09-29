/**
 * Build id embedded in the JS bundle. The diagnostic meta tag is written
 * from this same value so the two cannot drift.
 * Vite replaces `import.meta.env.EE_BUILD_ID` at build time
 * (`build/vite.js`). Docker does not have `.git` (see .dockerignore);
 * Fly must pass `--build-arg EE_BUILD_ID=git-<sha>-<YYYYMMDDHHmm>`.
 */

export function embeddedBuildId(env = import.meta.env) {
  const raw = env && typeof env.EE_BUILD_ID === 'string' ? env.EE_BUILD_ID.trim() : '';
  return raw || 'unknown';
}

/**
 * @param {Document} [doc]
 * @param {string} [id]
 * @returns {string}
 */
export function publishBuildStamp(doc = globalThis.document, id = embeddedBuildId()) {
  if (!doc?.createElement) return id;
  const head = doc.head || doc.documentElement;
  let meta = doc.querySelector?.('meta[name="ee-build"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.setAttribute('name', 'ee-build');
    if (head?.appendChild) head.appendChild(meta);
  }
  meta.setAttribute('content', id);
  doc.documentElement?.setAttribute?.('data-ee-build', id);
  return id;
}

/** @param {Document} [doc] */
export function readMetaBuildId(doc = globalThis.document) {
  const meta = doc?.querySelector?.('meta[name="ee-build"]');
  return String(meta?.getAttribute?.('content') || meta?.content || '');
}
