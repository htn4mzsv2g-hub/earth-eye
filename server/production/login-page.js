import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PRIVATE_BETA_CLOSED } from './users.js';

/**
 * Earth Eye account pages — calm premium Sign In / Create Account (AUTH-2).
 *
 * Self-contained HTML: inline CSS, wordmark SVG, tiny Show/Hide script.
 * No app bundle. Strict per-response CSP. Forms work without JavaScript.
 *
 * Honest gates (never fake working OAuth):
 * - Apple / Google: CONFIGURATION REQUIRED when secrets are missing.
 * - Forgot password: honest when email is not configured.
 * - Create Account: private beta closed server-side.
 */

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[ch],
  );

const FALLBACK_WORDMARK =
  '<div class="wordmark-text" aria-hidden="true">EARTH EYE</div>';

export function loadWordmarkSvg(candidates) {
  for (const file of candidates) {
    if (!file || !existsSync(file)) continue;
    const svg = readFileSync(file, 'utf8').trim();
    if (svg.startsWith('<svg') && !/<script/i.test(svg)) return svg;
  }
  return null;
}

export const MESSAGES = Object.freeze({
  invalid: 'Invalid credentials.',
  limited: (minutes) =>
    `Too many sign-in attempts. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
  forbidden:
    'Sign-in was blocked because the request did not come from this site. Reload the page and try again.',
  badRequest: 'Something went wrong with that sign-in. Please try again.',
  signedOut: 'You have been signed out.',
  signupClosed: PRIVATE_BETA_CLOSED,
  forgotUnavailable:
    'Password reset is not available yet. Email delivery is not configured for this private-beta deployment. Ask the owner to reset your password.',
  forgotSentPlaceholder:
    'If that account exists, reset instructions will be sent when email is configured.',
  mfaRequired: 'Enter the code from your authenticator app.',
  mfaInvalid: 'Invalid authenticator or recovery code.',
  mfaEnrollOk: 'Two-factor authentication is on. Save your recovery codes now — they are shown once.',
  sessionsRevoked: 'Other sessions signed out. This device stays signed in.',
  emailVerifyUnavailable:
    'Email verification is not available yet for this private-beta deployment.',
});

export const INFO_PAGES = Object.freeze({
  terms: {
    title: 'Terms of Service',
    body:
      'Earth Eye is a private beta. Access is by invitation only; registration is closed. ' +
      'Use is limited to evaluating the product with public, source-grounded data. ' +
      'Do not rely on Earth Eye for navigation, emergency response, policing, or any safety-critical decision. ' +
      'Full Terms of Service are not published yet. Continuing means you understand this is unfinished legal text for a closed beta, not a finished consumer contract.',
  },
  privacy: {
    title: 'Privacy Policy',
    body:
      'Earth Eye private beta: we collect account credentials needed to sign you in and basic session/security data to keep the service running. ' +
      'Provider API keys and owner secrets stay on the server; they are not shown on this page. ' +
      'A full Privacy Policy is not published yet. This notice is an honest placeholder for the closed beta, not finished legal advice.',
  },
});

export function loginPageCsp(nonce) {
  return [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const EYE =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';

function passwordField({ id, name, label, autocomplete }) {
  return `<label for="${id}">${label}</label>
      <div class="pw">
        <input id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" autocapitalize="none" autocorrect="off" spellcheck="false" required>
        <button type="button" class="pw-toggle" data-pw-toggle="${id}" aria-controls="${id}" aria-pressed="false" aria-label="Show password" hidden>${EYE}<span>Show</span></button>
      </div>`;
}

function tabs(active, next) {
  const q = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
  const tab = (id, href, label) =>
    `<a class="tab" href="${escapeHtml(href + q)}"${active === id ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="tabs" aria-label="Account">
      ${tab('signin', '/login', 'Sign In')}
      ${tab('signup', '/signup', 'Create Account')}
    </nav>`;
}

function message({ error, notice }) {
  if (error)
    return `<p class="msg msg-error" role="alert">${escapeHtml(error)}</p>`;
  if (notice)
    return `<p class="msg msg-notice" role="status">${escapeHtml(notice)}</p>`;
  return '';
}

function providerGate(kind, provider) {
  const label = kind === 'apple' ? 'Apple' : 'Google';
  const continueLabel = kind === 'apple' ? 'CONTINUE WITH APPLE' : 'CONTINUE WITH GOOGLE';
  // OAuth routes are not wired yet — never pretend CONTINUE works, and never
  // leak developer setup / env / callback instructions on the public card.
  if (provider?.configured) {
    return `<div class="provider" data-provider="${kind}">
      <div class="provider-row">
        <div class="provider-label">${label}</div>
        <span class="pill pill-muted">CURRENTLY UNAVAILABLE</span>
      </div>
      <p class="provider-note">${continueLabel} is not offered yet. Use password sign-in for this private beta.</p>
    </div>`;
  }
  return `<div class="provider provider-gated" data-provider="${kind}">
      <div class="provider-row">
        <div class="provider-label">${label}</div>
        <span class="pill pill-muted">CURRENTLY UNAVAILABLE</span>
      </div>
      <p class="provider-note">Not available on this deployment. Password sign-in still works for invited accounts.</p>
    </div>`;
}

function providersBlock(providers) {
  return `<div class="providers" aria-label="Other sign-in methods">
      <div class="divider"><span>or</span></div>
      ${providerGate('apple', providers?.apple)}
      ${providerGate('google', providers?.google)}
    </div>`;
}

function mainContent({
  mode,
  next,
  username,
  error,
  notice,
  info,
  remember,
  providers,
  emailConfigured,
  mfaStatus,
  trustedDevices,
  qrDataUrl,
  totpSecret,
  recoveryCodes,
}) {
  if (mode === 'logout')
    return `<form class="card" method="post" action="/logout">
      <h1>Sign out of Earth Eye</h1>
      <p class="lede">Sign out on this device?</p>
      <button type="submit" class="primary">Log Out</button>
      <a class="alt" href="/account/security">Account security</a>
      <a class="alt" href="/">Back to Earth Eye</a>
    </form>`;
  if (mode === 'info')
    return `<section class="card">
      <h1>${escapeHtml(info.title)}</h1>
      <p class="lede">${escapeHtml(info.body)}</p>
      <a class="alt" href="/login">Back</a>
    </section>`;
  if (mode === 'forgot') {
    const body = emailConfigured
      ? `<form class="card" method="post" action="/forgot" autocomplete="on">
      <h1>Reset your password</h1>
      ${message({ error, notice })}
      <p class="lede">Enter the email for your account. We will send a reset link if it exists.</p>
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus>
      <button type="submit" class="primary">Send reset link</button>
      <a class="alt" href="/login">Back to Sign In</a>
    </form>`
      : `<section class="card">
      <h1>Reset your password</h1>
      ${message({ error: error || MESSAGES.forgotUnavailable, notice })}
      <p class="lede">Private beta uses password sign-in for invited accounts. Email reset will appear here once email delivery is configured by the owner.</p>
      <a class="alt" href="/login">Back to Sign In</a>
    </section>`;
    return body;
  }
  if (mode === 'mfa')
    return `<form class="card" method="post" action="/login/2fa" autocomplete="one-time-code" aria-labelledby="mfa-title">
      <h1 id="mfa-title">Two-factor authentication</h1>
      ${message({ error, notice: notice || MESSAGES.mfaRequired })}
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <label for="code">Authenticator code</label>
      <input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="12" required autofocus>
      <p class="lede soft">Or enter a recovery code (xxxx-xxxx).</p>
      <button type="submit" class="primary">Verify</button>
      <a class="alt" href="/login">Back to Sign In</a>
    </form>`;
  if (mode === 'security') {
    const st = mfaStatus || { enabled: false, pending: false, recoveryRemaining: 0 };
    const devices = Array.isArray(trustedDevices) ? trustedDevices : [];
    const deviceList = devices.length
      ? `<ul class="plain-list">${devices.map((d) => `<li>${escapeHtml(d.label || 'Browser')} · expires ${escapeHtml(new Date(d.expiresAt).toLocaleDateString())}</li>`).join('')}</ul>`
      : `<p class="lede soft">No trusted devices yet. Use Remember me after 2FA to trust this browser.</p>`;
    return `<section class="card">
      <h1>Account security</h1>
      ${message({ error, notice })}
      <p class="lede">Owner password sign-in always works. Two-factor is optional.</p>
      <h2 class="subhead">Two-factor authentication</h2>
      <p class="lede soft">${st.enabled ? `On · ${st.recoveryRemaining} recovery code${st.recoveryRemaining === 1 ? '' : 's'} left` : 'Off — not required for the owner account.'}</p>
      ${st.enabled
        ? `<form method="post" action="/account/2fa/disable" class="stack">
        <label for="disable-code">Authenticator or recovery code</label>
        <input id="disable-code" name="code" type="text" autocomplete="one-time-code" required>
        <button type="submit" class="primary danger">Turn off 2FA</button>
      </form>`
        : `<form method="post" action="/account/2fa/start"><button type="submit" class="primary">Set up authenticator</button></form>`}
      <h2 class="subhead">Sessions &amp; devices</h2>
      ${deviceList}
      <form method="post" action="/account/sessions/revoke" class="stack">
        <button type="submit" class="secondary">Sign out other sessions</button>
      </form>
      <p class="lede soft">Keeps you signed in here. Ends other browsers and clears trusted devices.</p>
      <form method="post" action="/account/devices/revoke" class="stack">
        <button type="submit" class="secondary">Revoke trusted devices only</button>
      </form>
      <h2 class="subhead">Email &amp; password reset</h2>
      <p class="lede soft">${emailConfigured ? 'Email provider configured.' : MESSAGES.emailVerifyUnavailable}</p>
      <a class="alt" href="/">Back to Earth Eye</a>
      <a class="alt" href="/logout">Sign out</a>
    </section>`;
  }
  if (mode === 'mfa-enroll')
    return `<section class="card">
      <h1>Set up authenticator</h1>
      ${message({ error, notice })}
      <p class="lede">Scan the QR code, then enter a 6-digit code to enable. 2FA stays off until this step succeeds.</p>
      ${qrDataUrl ? `<img class="qr" src="${escapeHtml(qrDataUrl)}" width="200" height="200" alt="Authenticator QR code">` : ''}
      <p class="lede soft">Manual key</p>
      <code class="secret">${escapeHtml(totpSecret || '')}</code>
      <form method="post" action="/account/2fa/confirm" class="stack" autocomplete="one-time-code">
        <label for="confirm-code">Authentication code</label>
        <input id="confirm-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required autofocus>
        <button type="submit" class="primary">Verify and enable</button>
      </form>
      <form method="post" action="/account/2fa/cancel"><button type="submit" class="secondary">Cancel</button></form>
      <a class="alt" href="/account/security">Back</a>
    </section>`;
  if (mode === 'mfa-recovery')
    return `<section class="card">
      <h1>Recovery codes</h1>
      ${message({ notice: notice || MESSAGES.mfaEnrollOk })}
      <p class="lede">Store these somewhere safe. Each code works once. They will not be shown again.</p>
      <ul class="codes">${(recoveryCodes || []).map((c) => `<li><code>${escapeHtml(c)}</code></li>`).join('')}</ul>
      <a class="alt" href="/account/security">Done</a>
    </section>`;
  if (mode === 'signup')
    return `${tabs('signup', next)}
    <form class="card" method="post" action="/signup" autocomplete="on" aria-labelledby="signup-title">
      <h1 id="signup-title">Create an Earth Eye account</h1>
      ${message({ error: error || MESSAGES.signupClosed, notice })}
      <p class="lede soft">Private beta — registration is closed. Request access from the owner.</p>
      <label for="name">Name</label>
      <input id="name" name="name" type="text" autocomplete="name" required disabled>
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" required disabled>
      ${passwordField({ id: 'new-password', name: 'password', label: 'Password', autocomplete: 'new-password' }).replace('required>', 'required disabled>')}
      <button type="submit" class="primary" disabled>Create Account</button>
    </form>
    ${providersBlock(providers)}`;
  const focusPassword = Boolean(error && username);
  const rememberChecked = remember !== false;
  return `${tabs('signin', next)}
    <form class="card" method="post" action="/login" autocomplete="on" aria-labelledby="signin-title">
      <h1 id="signin-title">Sign in to Earth Eye</h1>
      ${message({ error, notice })}
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <label for="username">Email or username</label>
      <input id="username" name="username" type="text" value="${escapeHtml(username)}" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" required${focusPassword ? '' : ' autofocus'}>
      ${passwordField({
        id: 'password',
        name: 'password',
        label: 'Password',
        autocomplete: 'current-password',
      }).replace(
        'required>',
        `enterkeyhint="go" required${focusPassword ? ' autofocus' : ''}>`,
      )}
      <div class="row-between">
        <label class="check">
          <input type="checkbox" name="remember" value="1"${rememberChecked ? ' checked' : ''}>
          <span>Remember me</span>
        </label>
        <a class="text-link" href="/forgot">Forgot password?</a>
      </div>
      <button type="submit" class="primary">Sign In</button>
    </form>
    ${providersBlock(providers)}`;
}

const TOGGLE_SCRIPT = `(function(){var bs=document.querySelectorAll('[data-pw-toggle]');for(var k=0;k<bs.length;k++)(function(b){var i=document.getElementById(b.getAttribute('data-pw-toggle'));if(!i)return;var t=b.querySelector('span');function set(show){i.type=show?'text':'password';b.setAttribute('aria-pressed',String(show));b.setAttribute('aria-label',show?'Hide password':'Show password');t.textContent=show?'Hide':'Show';}b.hidden=false;b.addEventListener('click',function(){set(i.type==='password');i.focus();});if(i.form)i.form.addEventListener('submit',function(){set(false);});})(bs[k]);})();`;

/**
 * @param {object} options
 * @param {string|null} options.wordmarkSvg
 * @param {'signin'|'signup'|'logout'|'info'|'forgot'|'mfa'|'security'|'mfa-enroll'|'mfa-recovery'} [options.mode]
 * @param {string} [options.next]
 * @param {string} [options.username]
 * @param {string} [options.error]
 * @param {string} [options.notice]
 * @param {{title: string, body: string}} [options.info]
 * @param {boolean} [options.remember]
 * @param {object} [options.providers]
 * @param {boolean} [options.emailConfigured]
 */
export function renderLoginPage({
  wordmarkSvg,
  mode = 'signin',
  next = '/',
  username = '',
  error = '',
  notice = '',
  info = INFO_PAGES.terms,
  remember = true,
  providers = null,
  emailConfigured = false,
  mfaStatus = null,
  trustedDevices = null,
  qrDataUrl = '',
  totpSecret = '',
  recoveryCodes = null,
}) {
  const nonce = randomBytes(16).toString('base64');
  const wordmark = wordmarkSvg
    ? wordmarkSvg
        .replace(/<style(\s|>)/, `<style nonce="${nonce}"$1`)
        .replace(/\s(role|aria-labelledby)="[^"]*"/g, '')
        .replace(
          '<svg ',
          '<svg class="wordmark" aria-hidden="true" focusable="false" ',
        )
    : FALLBACK_WORDMARK;
  const title =
    mode === 'logout'
      ? 'Sign out'
      : mode === 'signup'
        ? 'Create account'
        : mode === 'forgot'
          ? 'Forgot password'
          : mode === 'mfa'
            ? 'Two-factor'
            : mode === 'security'
              ? 'Account security'
              : mode === 'mfa-enroll'
                ? 'Set up 2FA'
                : mode === 'mfa-recovery'
                  ? 'Recovery codes'
                  : mode === 'info'
                    ? info.title
                    : 'Sign in';
  const hasPassword = mode === 'signin' || mode === 'signup';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#070a0c">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<title>${escapeHtml(title)} · Earth Eye</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style nonce="${nonce}">
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;background:#070a0c}
body{margin:0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:max(28px,env(safe-area-inset-top)) max(22px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(22px,env(safe-area-inset-left));
  color:#e8eef2;font:16px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,system-ui,sans-serif;
  background:radial-gradient(110% 70% at 50% -10%,#121a1f 0%,#070a0c 58%) fixed,#070a0c}
main{width:100%;max-width:400px;display:flex;flex-direction:column;align-items:stretch;gap:20px;animation:ee-rise .55s ease-out both}
@keyframes ee-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.brand{display:flex;flex-direction:column;align-items:center;gap:10px;margin:0}
.wordmark{display:block;width:100%;height:auto;max-width:340px}
.wordmark-text{font-weight:700;letter-spacing:.32em;font-size:28px;text-align:center}
.app-name{margin:0;font-size:12px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:#a8b4bb}
.app-name span{color:#7f8c94;font-weight:500}
.tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border:1px solid rgba(232,238,242,.12);border-radius:999px;background:rgba(232,238,242,.03)}
.tab{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:999px;color:#c5ced3;text-decoration:none;font-size:15px;font-weight:600}
.tab[aria-current=page]{background:#e8eef2;color:#070a0c}
.card{display:flex;flex-direction:column;gap:8px;padding:22px 22px 24px;border:1px solid rgba(232,238,242,.12);border-radius:20px;
  background:rgba(232,238,242,.03);box-shadow:0 24px 64px rgba(0,0,0,.4)}
h1{margin:0 0 4px;font-size:21px;line-height:1.25;font-weight:650;letter-spacing:.01em}
label{font-size:13px;font-weight:600;color:#b7c2c8;margin-top:10px}
input[type=text],input[type=email],input[type=password]{width:100%;height:50px;padding:0 14px;font:inherit;font-size:17px;color:#f3f7f9;
  background:#0b1114;border:1px solid rgba(232,238,242,.28);border-radius:12px;outline:none;-webkit-appearance:none;appearance:none}
input:focus{border-color:#e8eef2;box-shadow:0 0 0 3px rgba(232,238,242,.22)}
input:disabled{opacity:.55;cursor:not-allowed}
.pw{position:relative}
.pw input{padding-right:92px}
.pw-toggle{position:absolute;top:3px;right:3px;height:44px;min-width:78px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center;gap:6px;
  border:0;border-radius:9px;background:transparent;color:#d0d8dd;font:inherit;font-size:15px;font-weight:600;cursor:pointer;-webkit-appearance:none;appearance:none}
.pw-toggle[hidden]{display:none}
.pw-toggle svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8}
.pw-toggle[aria-pressed=true] svg{opacity:.55}
.row-between{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;min-height:44px}
.check{display:inline-flex;align-items:center;gap:10px;margin:0;font-size:14px;font-weight:500;color:#c5ced3;cursor:pointer}
.check input{width:18px;height:18px;accent-color:#e8eef2}
.text-link{color:#c5ced3;font-size:14px;font-weight:500;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
.text-link:hover{color:#e8eef2;text-decoration:underline}
.primary{margin-top:16px;height:52px;border:0;border-radius:14px;font:inherit;font-size:17px;font-weight:650;letter-spacing:.02em;
  color:#070a0c;background:#e8eef2;cursor:pointer;-webkit-appearance:none;appearance:none;touch-action:manipulation}
.primary:active{background:#cfd8dd}
.primary:disabled{opacity:.45;cursor:not-allowed}
a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #7cc4ff;outline-offset:2px}
.msg{margin:4px 0 6px;padding:12px 14px;border-radius:12px;font-size:14px;line-height:1.4}
.msg-error{color:#ffe3e0;background:rgba(255,92,80,.12);border:1px solid rgba(255,120,110,.5)}
.msg-notice{color:#e8eef2;background:rgba(232,238,242,.06);border:1px solid rgba(232,238,242,.2)}
.lede{margin:0 0 6px;font-size:15px;color:#c5ced3}
.lede.soft{color:#9aa7ad}
.lede code,.provider-note code{font-size:12px;color:#d7dee3}
.alt{display:flex;align-items:center;justify-content:center;min-height:44px;margin-top:8px;color:#c5ced3;font-size:15px;text-decoration:none}
.providers{display:flex;flex-direction:column;gap:10px}
.divider{display:flex;align-items:center;gap:12px;color:#7f8c94;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:rgba(232,238,242,.12)}
.provider{padding:14px 16px;border-radius:16px;border:1px solid rgba(232,238,242,.12);background:rgba(232,238,242,.025)}
.provider-gated{border-style:dashed}
.provider-label{font-size:15px;font-weight:650;color:#e8eef2}
.provider-status{margin:8px 0 0}
.pill{display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.06em;
  color:#1a1408;background:#e6c35c}
.pill-muted{color:#c5ced3;background:rgba(232,238,242,.12);font-weight:650}
.provider-note{margin:8px 0 0;font-size:13px;line-height:1.4;color:#9aa7ad}
.provider-help{margin-top:8px;font-size:13px;color:#b7c2c8}
.provider-help summary{cursor:pointer;min-height:36px;display:flex;align-items:center}
.provider-help ul{margin:8px 0 0;padding-left:18px;color:#9aa7ad}
.provider-help li{margin:4px 0}
.provider-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.subhead{margin:18px 0 4px;font-size:15px;font-weight:650;color:#e8eef2}
.stack{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.secondary{margin-top:8px;height:48px;border:1px solid rgba(232,238,242,.28);border-radius:14px;font:inherit;font-size:15px;font-weight:600;
  color:#e8eef2;background:transparent;cursor:pointer}
.primary.danger{background:#f0b4ae;color:#2a0e0c}
.qr{display:block;margin:12px auto;border-radius:12px;background:#fff;padding:10px}
.secret{display:block;margin:4px 0 12px;padding:12px;border-radius:10px;background:#0b1114;border:1px solid rgba(232,238,242,.16);
  font-size:14px;letter-spacing:.06em;word-break:break-all;color:#e8eef2}
.codes{margin:8px 0 0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.codes code{display:block;padding:10px;border-radius:10px;background:#0b1114;border:1px solid rgba(232,238,242,.14);font-size:13px;text-align:center}
.plain-list{margin:4px 0 8px;padding-left:18px;color:#9aa7ad;font-size:14px}
footer{display:flex;justify-content:center;gap:8px;font-size:13px;color:#8b979e}
footer a{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;color:#a8b4bb;text-decoration:none}
footer a:hover{color:#e8eef2}
@media (prefers-reduced-motion: reduce){main{animation:none}}
@media (min-height:760px){main{margin-top:-3vh}}
</style>
</head>
<body>
<main>
  <header class="brand">
    ${wordmark}
    <p class="app-name">Earth Eye <span>· Private beta</span></p>
  </header>
  ${mainContent({ mode, next, username, error, notice, info, remember, providers, emailConfigured, mfaStatus, trustedDevices, qrDataUrl, totpSecret, recoveryCodes })}
  <footer><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>
</main>
${hasPassword ? `<script nonce="${nonce}">${TOGGLE_SCRIPT}</script>` : ''}
</body>
</html>
`;
  return { html, nonce, csp: loginPageCsp(nonce) };
}
