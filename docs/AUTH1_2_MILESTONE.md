# AUTH-1 + AUTH-2 — Account model + polished gated login

**Date:** 2026-09-29 ~3:55 AM CT  
**Branch:** `stage5-incident-workspaces`  
**Rollback image (pre-AUTH behavior):** Fly **v32**  
`registry.fly.io/eartheye:deployment-01M3P5KH7X4GBYAY4AMF4W5CT6`  
(also retain v31 `deployment-01M3P5F2GRDTMWX5RMYWT6A4RR`)  
**Keep secrets:** `LOGIN_USER`, `LOGIN_PASS`, `SESSION_SECRET` (never unset on rollback)

Owner confirmed LOGIN OK on eartheye.us before AUTH-1/2. Option C unchanged. No push of git remotes required beyond Fly deploy of the image. No Apple/Google secrets invented. No open public registration. Globe / Analyst / cameras untouched.

---

## AUTH-1 — Secure account / session model

| Change | Detail |
| --- | --- |
| Env owner path | `createEnvAdminStore` remains the break-glass owner (`role: 'owner'`, displayName `Owner`) |
| Authority seam | `createAccountAuthority({ userStore, registration })` — registration stays `createClosedRegistration()` |
| Providers detect-only | `auth-providers.js` → `resolveAuthProviders(env)` reports Apple / Google / email readiness + missing names |
| Remember me | Token TTL 30d when `remember=1`; browser-session TTL (16h) + **no Max-Age** when unchecked |
| `/forgot` route | Honest UI; 503 when email not configured |

**Not in AUTH-1:** durable user DB, invite tokens, live OAuth callbacks, outbound email.

---

## AUTH-2 — Polished login / create UI

Calm premium dark chrome (softer radius, divider, provider cards):

- Sign In: Remember me (default on) + Forgot password? link
- Create Account: closed banner + disabled fields + server `POST /signup` → **403** `Private beta is currently closed.`
- Apple / Google: **CONFIGURATION REQUIRED** pills + expandable credential/redirect checklist for eartheye.us (not fake working buttons)
- Forgot: explains Fly `LOGIN_PASS` rotation until email secrets exist

---

## Credential / redirect checklist (eartheye.us)

### Owner password (already live — do not remove)

| Secret | Purpose |
| --- | --- |
| `LOGIN_USER` | Owner identifier (exact match) |
| `LOGIN_PASS` | Owner password |
| `SESSION_SECRET` | HMAC key ≥32 chars |

### Apple Sign In (AUTH-4 later — do not invent)

| Item | Value |
| --- | --- |
| Domains | `eartheye.us`, `www.eartheye.us` |
| Return URLs | `https://eartheye.us/auth/apple/callback`, `https://www.eartheye.us/auth/apple/callback` |
| Fly secrets | `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` |

### Google OAuth (AUTH-5 later — do not invent; not Maps keys)

| Item | Value |
| --- | --- |
| Origins | `https://eartheye.us`, `https://www.eartheye.us` |
| Redirect URIs | `https://eartheye.us/auth/google/callback`, `https://www.eartheye.us/auth/google/callback` |
| Fly secrets | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |

### Email reset (AUTH-3 later)

| Fly secrets | `EMAIL_FROM`, plus `EMAIL_API_KEY` **or** `SMTP_URL` |

---

## Verify after deploy

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://eartheye.us/login          # 200
curl -sS -o /dev/null -w '%{http_code}\n' https://eartheye.us/forgot         # 200
# bad creds → 200 + Invalid credentials.
# POST /signup → 403 Private beta closed
# Owner: Sign In with LOGIN_* still works (Remember me optional)
```

Rollback:

```bash
env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3P5KH7X4GBYAY4AMF4W5CT6
```

## Tests

`node --test src/tooling/productionAuth.test.mjs` → **18/18 pass** (AUTH-0 suite + Remember me / Forgot / gates / authority).

## Files

- `server/production/auth-providers.js` (new)
- `server/production/users.js`, `session-auth.js`, `login-page.js`, `app.js`
- `src/tooling/productionAuth.test.mjs`
- `docs/AUTH1_2_MILESTONE.md`, mirrors under `earth-eye-spec/`

---

## Live release (AUTH-1/2)

| Item | Value |
| --- | --- |
| Fly version | **v33** |
| Image | `registry.fly.io/eartheye:deployment-01M3P5VT09D8R1W1R8JCGGW775` |
| Deployed | 2026-09-29 ~3:53 AM CT |
| Git | `d61c141` feat(auth): AUTH-1 account/session + AUTH-2 polished gated login |
| Checks | login 200, forgot 200, signup POST 403, bad creds Invalid credentials, API 401 |
| Secrets | `LOGIN_USER` / `LOGIN_PASS` / `SESSION_SECRET` still Deployed |

Owner: please spot-check Sign In once with Remember me on https://eartheye.us/login.
