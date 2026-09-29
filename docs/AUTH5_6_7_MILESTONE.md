# AUTH-5 / AUTH-6 / AUTH-7 — TOTP 2FA, trusted devices, account security

**Date:** 2026-09-29 ~4:05 AM CT  
**Branch:** `stage5-incident-workspaces`  
**Rollback:** Fly **v33** `registry.fly.io/eartheye:deployment-01M3P5VT09D8R1W1R8JCGGW775`  
**Keep:** `LOGIN_USER` / `LOGIN_PASS` / `SESSION_SECRET` (never unset)

No Apple/Google/SendGrid secrets invented. No open registration. Owner password path unchanged. Option C volume used for MFA state (`/data/auth`).

---

## AUTH-5 — Optional TOTP 2FA + recovery codes

| Behavior | Detail |
| --- | --- |
| Optional | Owner is **not** forced — password-only works until enroll completes |
| Enroll | `/account/security` → Set up → QR + manual key → verify code **before** enable |
| Secret storage | AES-256-GCM encrypted with key derived from `SESSION_SECRET` |
| Recovery codes | 10 codes shown **once**; SHA-256 hashed at rest; single-use |
| Login gate | If enabled: password → `ee_mfa` pending cookie → `/login/2fa` → only then `ee_session` |
| Pending MFA | Does **not** grant API/app access |

## AUTH-6 — Remember me / trusted devices

| Behavior | Detail |
| --- | --- |
| Remember me | Unchanged TTL: 30d Max-Age vs browser-session cookie |
| After MFA + Remember me | Sets `ee_trust` (30d); device id hashed in MFA store |
| Next login | Valid trust cookie skips 2FA challenge |
| Revoke | `/account/devices/revoke` clears trusted devices + trust cookie |

## AUTH-7 — Account security + honest email gates

| Page | `/account/security` (requires full session) |
| --- | --- |
| 2FA | Status, enroll, disable (code required) |
| Trusted devices | List + revoke |
| Email / reset / verify | Honest **not configured** copy until `EMAIL_FROM` + `EMAIL_API_KEY`\|`SMTP_URL` |
| `/forgot` | Still honest when email unset |

OAuth CONFIGURATION REQUIRED copy calmed (shorter notes; checklist under “What to configure”).

---

## Verify after deploy

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://eartheye.us/login          # 200
# bad password → Invalid credentials
# POST /signup → 403
# Owner password (2FA off): Sign In → app (no /login/2fa)
# Optional: after enroll, password → /login/2fa until code/recovery
```

Rollback:

```bash
env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3P5VT09D8R1W1R8JCGGW775
```

## Tests

`node --test src/tooling/productionAuth.test.mjs` → **23/23**

## Files

- `server/production/totp.js`, `mfa-store.js`, `trust-device.js` (new)
- `session-auth.js`, `login-page.js`, `app.js`, `docker-entrypoint.sh`
- `docs/AUTH5_6_7_MILESTONE.md`


## Live release

| Item | Value |
| --- | --- |
| Fly | **v36** `registry.fly.io/eartheye:deployment-01M3P6CVGHGWGRTMDCRTX6YVNA` (AUTH tip after UX race; rollback v33 still valid) |
| Git | `42b86fd` |
| Deployed | 2026-09-29 ~4:02 AM CT |
| Verified | login 200, signup 403, bad creds fail, API 401, `/login/2fa` redirects without pending |
| Secrets | LOGIN_* / SESSION_SECRET still Deployed |

Owner: password Sign In should still land in the app (2FA off by default). Optional enroll at `/account/security` after login (via Sign out → Account security).
