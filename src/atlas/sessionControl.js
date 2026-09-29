/**
 * Log Out control for the hosted Earth Eye (production server sign-in).
 *
 * The production server answers GET /api/session with
 * `{ authEnabled, authenticated }`. Only when both are true are SECURITY and
 * LOG OUT controls added to the quick-action dock (bottom-right on desktop,
 * inside MORE on phones). It submits a plain POST /logout form, so the
 * server clears the HttpOnly session cookie and redirects to the sign-in
 * page. Local/dev servers have no such endpoint and show nothing.
 */
export const SESSION_ENDPOINT = '/api/session';
export const LOGOUT_FORM_ID = 'ee-logout-form';

export function shouldShowLogout(payload) {
  return Boolean(
    payload && payload.authEnabled === true && payload.authenticated === true,
  );
}

export const LOGOUT_BUTTON_HTML = `<button type="submit" form="${LOGOUT_FORM_ID}" class="atlas-dock-logout" data-ee-logout title="Log out of Earth Eye" aria-label="Log out"><span><svg class="ee-dock-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/></svg></span><b>LOG OUT</b></button>`;

/** AUTH-8: Account security (2FA, sessions) — full page, session required. */
export const SECURITY_LINK_HTML = `<a href="/account/security" class="atlas-dock-security" data-ee-security title="Account security" aria-label="Account security"><span><svg class="ee-dock-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3l7 3v5c0 4.5-2.8 7.7-7 9-4.2-1.3-7-4.5-7-9V6l7-3z"/><path d="M9.5 12.2l1.8 1.8 3.4-3.6" fill="none"/></svg></span><b>SECURITY</b></a>`;

/**
 * @param {object} o
 * @param {HTMLElement} o.dock - #atlas-dock.
 * @param {Document} [o.doc]
 * @param {typeof fetch} [o.fetchImpl]
 * @param {AbortSignal} [o.signal]
 * @returns {Promise<HTMLElement|null>} The button, or null when not signed in via the server.
 */
export async function mountSessionControl({
  dock,
  doc = globalThis.document,
  fetchImpl = globalThis.fetch,
  signal,
}) {
  if (!dock || !doc || typeof fetchImpl !== 'function') return null;
  let payload = null;
  try {
    const response = await fetchImpl(SESSION_ENDPOINT, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    return null;
  }
  if (!shouldShowLogout(payload) || signal?.aborted) return null;
  if (dock.querySelector('[data-ee-logout]')) return null;
  if (!doc.getElementById(LOGOUT_FORM_ID)) {
    const form = doc.createElement('form');
    form.id = LOGOUT_FORM_ID;
    form.method = 'post';
    form.action = '/logout';
    form.hidden = true;
    doc.body.appendChild(form);
  }
  if (!dock.querySelector('[data-ee-security]'))
    dock.insertAdjacentHTML('beforeend', SECURITY_LINK_HTML);
  dock.insertAdjacentHTML('beforeend', LOGOUT_BUTTON_HTML);
  return dock.querySelector('[data-ee-logout]');
}
