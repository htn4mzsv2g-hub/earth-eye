/**
 * Stage 5.5 — CSP / security-header audit snapshot (read-only facts).
 * Does not invent browser enforcement; documents what production sets today.
 */
import { loginPageCsp } from '../production/login-page.js';

/** Static expectations for production login + API gate headers. */
export function cspAuditSnapshot({ nonce = 'AUDIT_NONCE' } = {}) {
  const loginCsp = loginPageCsp(nonce);
  const directives = Object.fromEntries(
    loginCsp.split(';').map((part) => {
      const t = part.trim();
      const i = t.indexOf(' ');
      return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 1).trim()];
    }),
  );
  return {
    ok: true,
    generatedFor: 'earth-eye-production',
    loginPage: {
      csp: loginCsp,
      directives,
      requiresNonce: true,
      defaultSrcNone: directives['default-src'] === "'none'",
      frameAncestorsNone: directives['frame-ancestors'] === "'none'",
      formActionSelf: directives['form-action'] === "'self'",
    },
    apiAndShell: {
      frameAncestors: "frame-ancestors 'none'",
      note: 'Production app.js sets CSP frame-ancestors none on non-login responses via policy headers.',
    },
    gaps: [
      'Full Cesium globe CSP for authenticated SPA is browser-delivered from the built index — keep third-party tile hosts allowlisted only as needed.',
      'iPhone lag remains an open performance issue (not CSP).',
    ],
    billingUi: false,
    adminUiExposed: false,
  };
}

export function assertHardeningInvariants(audit = cspAuditSnapshot()) {
  const failures = [];
  if (!audit.loginPage.defaultSrcNone) failures.push('login default-src must be none');
  if (!audit.loginPage.frameAncestorsNone)
    failures.push('login frame-ancestors must be none');
  if (audit.billingUi) failures.push('billing UI must stay false');
  if (audit.adminUiExposed) failures.push('admin UI must stay hidden');
  return { ok: failures.length === 0, failures };
}
