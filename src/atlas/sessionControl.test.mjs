import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOGOUT_BUTTON_HTML,
  LOGOUT_FORM_ID,
  SECURITY_LINK_HTML,
  SESSION_ENDPOINT,
  mountSessionControl,
  shouldShowLogout,
} from './sessionControl.js';

function fakeDom() {
  const byId = new Map();
  const body = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      byId.set(node.id, node);
    },
  };
  const doc = {
    body,
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => ({ tag }),
  };
  const dock = {
    html: '',
    insertAdjacentHTML(position, html) {
      assert.equal(position, 'beforeend');
      this.html += html;
    },
    querySelector(selector) {
      if (selector === '[data-ee-logout]')
        return this.html.includes('data-ee-logout') ? { logout: true } : null;
      if (selector === '[data-ee-security]')
        return this.html.includes('data-ee-security')
          ? { security: true }
          : null;
      return null;
    },
  };
  return { doc, dock, body };
}

const reply =
  (payload, ok = true) =>
  async (url, init) => {
    assert.equal(url, SESSION_ENDPOINT);
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store');
    return { ok, json: async () => payload };
  };

test('Log Out shows only when the server reports an active sign-in', () => {
  assert.equal(
    shouldShowLogout({ authEnabled: true, authenticated: true }),
    true,
  );
  assert.equal(
    shouldShowLogout({ authEnabled: false, authenticated: false }),
    false,
  );
  assert.equal(shouldShowLogout({ authEnabled: true }), false);
  assert.equal(shouldShowLogout(null), false);
});

test('mountSessionControl adds SECURITY link and POST /logout button', async () => {
  const { doc, dock, body } = fakeDom();
  const button = await mountSessionControl({
    dock,
    doc,
    fetchImpl: reply({ authEnabled: true, authenticated: true }),
  });
  assert.ok(button);
  assert.equal(body.children.length, 1);
  const form = body.children[0];
  assert.deepEqual(
    {
      id: form.id,
      method: form.method,
      action: form.action,
      hidden: form.hidden,
    },
    { id: LOGOUT_FORM_ID, method: 'post', action: '/logout', hidden: true },
  );
  assert.match(
    LOGOUT_BUTTON_HTML,
    new RegExp(`type="submit" form="${LOGOUT_FORM_ID}"`),
  );
  assert.match(LOGOUT_BUTTON_HTML, /aria-label="Log out"/);
  assert.match(SECURITY_LINK_HTML, /href="\/account\/security"/);
  assert.match(dock.html, /SECURITY/);
  assert.match(dock.html, /LOG OUT/);
  assert.match(dock.html, /data-ee-security/);
  // Idempotent.
  await mountSessionControl({
    dock,
    doc,
    fetchImpl: reply({ authEnabled: true, authenticated: true }),
  });
  assert.equal(dock.html.match(/data-ee-logout/g).length, 1);
  assert.equal(dock.html.match(/data-ee-security/g).length, 1);
});

test('no button on dev/local servers, errors or signed-out responses', async () => {
  for (const fetchImpl of [
    reply({ authEnabled: false, authenticated: false }),
    reply({ error: 'Unknown API route' }, false),
    async () => {
      throw new Error('offline');
    },
    reply(null),
  ]) {
    const { doc, dock, body } = fakeDom();
    assert.equal(await mountSessionControl({ dock, doc, fetchImpl }), null);
    assert.equal(dock.html, '');
    assert.equal(body.children.length, 0);
  }
});
