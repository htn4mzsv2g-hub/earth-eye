# AUTH-8 — Regression checklist + sessions UI

**Date:** 2026-09-29 ~4:05 AM CT  
**Live baseline before this slice:** Fly v36 `deployment-01M3P6CVGHGWGRTMDCRTX6YVNA`  
**Owner gates next (do not invent):** Google/Apple OAuth secrets (AUTH-4/5 IdP), email provider for reset (AUTH-3)

No open registration. 2FA remains **optional**. Owner `LOGIN_USER` / `LOGIN_PASS` path kept.

---

## What AUTH-8 added

| Item | Status |
| --- | --- |
| Regression checklist (this doc) | Done |
| MORE → ACCOUNT → **SECURITY** | Wired (`/account/security`) when signed in |
| MORE → ACCOUNT → **LOG OUT** | Already present; still placed under ACCOUNT |
| Sign out other sessions | `/account/sessions/revoke` bumps durable `sessionEpoch` + re-issues **this** cookie; other `ee_session` cookies fail |
| Revoke trusted devices | Still available on account security |
| OAuth / SendGrid | Not invented — CONFIGURATION REQUIRED / email-not-configured remain honest |

---

## Manual / live regression checklist

Run after deploy (owner password; 2FA off unless explicitly enrolled):

### Gate & pages
- [ ] `GET /healthz` → 200
- [ ] HTML `/` → 302 `/login`
- [ ] `GET /login` → 200; Remember me; calmer CONFIGURATION REQUIRED (Apple/Google)
- [ ] `POST /signup` → 403 `Private beta is currently closed.`
- [ ] Wrong password → `Invalid credentials.` (no session cookie)
- [ ] Owner password Sign In → app (no `/login/2fa` when 2FA off)
- [ ] `GET /api/cctv/sources` without cookie → 401
- [ ] `GET /forgot` → honest email-not-configured message
- [ ] `GET /login/2fa` without pending → 302 `/login`

### MORE / account
- [ ] Compact MORE → ACCOUNT shows **SECURITY** + **LOG OUT** when signed in
- [ ] SECURITY opens `/account/security` (2FA optional, sessions, email honesty)
- [ ] **Sign out other sessions** keeps current device; second browser loses access
- [ ] LOG OUT clears session; back to Sign In

### Optional 2FA (do not force)
- [ ] Account security → Set up authenticator → QR → wrong code rejected → correct code enables
- [ ] Recovery codes shown once
- [ ] After enable: password → `/login/2fa` until code; pending MFA cannot call `/api/*`
- [ ] Remember me + 2FA → trusted device can skip 2FA next time
- [ ] Turn off 2FA with code → password-only again

### Rollback
```bash
env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3P6CVGHGWGRTMDCRTX6YVNA
# Keep LOGIN_USER LOGIN_PASS SESSION_SECRET
```

### Automated
```bash
node --test src/tooling/productionAuth.test.mjs
node --test src/atlas/sessionControl.test.mjs
```

---

## Stop for owner

Next AUTH work needs owner-supplied secrets (do **not** invent):

| Gate | Secrets / setup |
| --- | --- |
| AUTH-3 email reset | `EMAIL_FROM` + `EMAIL_API_KEY` or `SMTP_URL` (+ DNS) |
| Apple Sign In | `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` + Return URLs |
| Google Sign In | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` + redirect URIs (not Maps keys) |

Until then: password (+ optional TOTP) is the production path.

## Live release (AUTH-8)

| Item | Value |
| --- | --- |
| Fly | **v38** `registry.fly.io/eartheye:deployment-01M3P6HPRBC3YV6H3V3Q9D8MAW` |
| Git | `4c1328a` |
| Deployed | 2026-09-29 ~4:05 AM CT |
| Verified | login 200, signup 403, bad creds, API 401 |
| Rollback | v36 `…01M3P6CVGHGWGRTMDCRTX6YVNA` or v33 |
