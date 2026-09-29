# AUTH-0 — Production authentication audit

**Date:** 2026-09-29 ~3:48 AM CT  
**Branch:** `stage5-incident-workspaces`  
**AUTH-0 docs:** this file + `AUTH_DIRECTIVE_2026-09-29.md` + `docs/auth-screenshots/` (committed on this branch; no push)  
**Stable pre-AUTH code parent (auth modules unchanged):** `874883ace92ab1ca59fbba682487061a756a2a33` (`874883a` feat(ux-2))  
**Auth modules also identical at:** `172a561` (UX-1 docs) — `server/production/{session-auth,users,login-page,app}.js` untouched by UX-1/UX-2  
**Live Fly (AUTH-0 rollback baseline):** app `eartheye`, machine `28654321fd7928`, **version 31**, region `dfw`  
**Live image:** `registry.fly.io/eartheye:deployment-01M3P5F2GRDTMWX5RMYWT6A4RR`  
**Digest:** `sha256:0f007187b733b792adb00eb8db0c0d1a335d11e18443653decf90eb351fccc46`  
**Prior image:** v30 `deployment-01M3P55HGZXSXDRMAKR9WXRFJD`  
**Option C:** KEEP (unchanged) — see `docs/OPTION_C_FLY.md`  
**Directive:** `docs/AUTH_DIRECTIVE_2026-09-29.md` (+ `earth-eye-spec/` mirror)  
**Screenshots:** `docs/auth-screenshots/` (Sign In / Create Account / invalid)

AUTH-0 is **docs + rollback only**. No auth code migration. No push. No Fly
deploy for AUTH-0. AUTH-1+ must not start until this audit is accepted and the
owner password path still works.

---

## 1. Rollback record (create BEFORE auth changes)

### Git

| Item | Value |
| --- | --- |
| Branch | `stage5-incident-workspaces` |
| Stable auth-code parent | `874883ace92ab1ca59fbba682487061a756a2a33` (`feat(ux-2)`) |
| Auth files vs live | **Identical** through UX-1/UX-2 — no auth migration yet |
| AUTH-0 change set | Docs + screenshots only (`AUTH0_AUDIT.md`, `AUTH_DIRECTIVE_2026-09-29.md`, `auth-screenshots/`) |

Working tree may receive **parallel UX-agent** commits. Those are **out of AUTH scope**.
Do not mix auth behavior commits with unrelated UX files.

Restore auth source only (if a later AUTH commit goes wrong, before push):

```bash
cd /workspace/atlas-eye
git checkout 874883ace92ab1ca59fbba682487061a756a2a33 -- \
  server/production/session-auth.js \
  server/production/users.js \
  server/production/login-page.js \
  server/production/app.js \
  src/tooling/productionAuth.test.mjs
```

Full tree rollback to the stable pre-AUTH feature parent (destructive to later
local commits — confirm first):

```bash
git switch stage5-incident-workspaces
git reset --hard 874883ace92ab1ca59fbba682487061a756a2a33
```

### Fly image / tag (live AUTH-0 baseline)

| Item | Value |
| --- | --- |
| Release | **v31** (complete) — UX-2; **auth modules unchanged** |
| Image tag | `deployment-01M3P5F2GRDTMWX5RMYWT6A4RR` |
| Full ref | `registry.fly.io/eartheye:deployment-01M3P5F2GRDTMWX5RMYWT6A4RR` |
| Machine | `28654321fd7928` (started, 1/1 check passing) |
| Prior images | v30 `deployment-01M3P55HGZXSXDRMAKR9WXRFJD`; v29 `deployment-01M3P4QSPACE9NQ2B9A2KNY2JY` |

**Revert live app to this AUTH-0 image** (no new build; `--ha=false`; Option C volume stays):

```bash
env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3P5F2GRDTMWX5RMYWT6A4RR
```

**Do not** unset `LOGIN_USER` / `LOGIN_PASS` / `SESSION_SECRET` during any
AUTH rollback — that would open the server or force everyone signed out /
lock the owner depending on half-set rules.

### Secrets present on Fly (names only; digests not credentials)

| Secret | Status |
| --- | --- |
| `LOGIN_USER` | Deployed |
| `LOGIN_PASS` | Deployed |
| `SESSION_SECRET` | Deployed (≥32 chars required by boot) |
| `ALLOWED_HOSTS` | Deployed (`eartheye.us,www.eartheye.us`) |
| `TOMTOM_API_KEY` | Deployed (nav; unrelated to auth) |

No Apple / Google OAuth client IDs or secrets on Fly. No email-provider secrets.

---

## 2. Current authentication model

### Architecture (Phase-1 / private beta)

Single **env-admin** account + **HMAC session cookie**. Registration closed.

| Piece | File | Role |
| --- | --- | --- |
| Session authority | `server/production/session-auth.js` | `ee_session` HMAC-SHA256 cookie; 30-day TTL; sliding re-issue ≥1 day; password-version binding; per-IP login limiter (10 / 15 min); SameSite=Lax CSRF origin check; `safeNextPath` open-redirect guard |
| User store | `server/production/users.js` | `createEnvAdminStore({user,pass})` → one user `id: 'admin'`; constant-time compare; `createClosedRegistration()` always returns `Private beta is currently closed.` |
| HTML chrome | `server/production/login-page.js` | Self-contained Sign In / Create Account / Log Out / Terms / Privacy; nonce CSP; no app bundle |
| Wiring | `server/production/app.js` | Pipeline: security headers → `/healthz` → host allowlist → auth pages → session gate → API/static |
| Tests | `src/tooling/productionAuth.test.mjs` | 13/13 pass (AUTH-0 re-run 2026-09-29 ~3:45 AM CT) |

### Credential resolution

`resolveLoginConfig(env)` reads `LOGIN_USER`+`LOGIN_PASS`, else legacy
`BASIC_AUTH_USER`+`BASIC_AUTH_PASS`. Half-set pair **refuses to boot**.
No credentials → open server (local/dev). `SESSION_SECRET` optional but
required ≥32 chars when set; without it sessions die on restart.

### Routes

| Route | Unauthenticated behavior |
| --- | --- |
| `GET /login` | 200 sign-in HTML |
| `POST /login` | Form auth → `303` + `Set-Cookie: ee_session` or 200 + `Invalid credentials.` |
| `GET /signup` | 200 Create Account HTML (fields visible) |
| `POST /signup` | **403** + exact `Private beta is currently closed.` (body never stored) |
| `GET|POST /logout` | Confirm page / revoke + clear cookie |
| `GET /terms`, `/privacy` | Public placeholders |
| `GET /healthz` | 200 JSON (before auth) |
| HTML navigation to app | `302 /login` |
| `/api/*` without cookie | `401` JSON `{ error, login: '/login' }` — **never** `WWW-Authenticate` |
| Brand icons | Public allowlist only |

### Session cookie

- Name: `ee_session`
- Flags: `HttpOnly`, `Secure` (when HTTPS / proxy), `SameSite=Lax`, `Path=/`
- Payload: versioned HMAC token with subject + keyed password version
- Changing `LOGIN_USER` or `LOGIN_PASS` invalidates all sessions
- In-memory revoke set (lost on process restart; cookie still password-versioned)

### UI evidence (no Apple/Google today)

Live screenshots (`docs/auth-screenshots/`):

- Sign In: email/username + password + Show — **no** third-party buttons
- Create Account: Name / Email / Password + red **Private beta is currently closed.**
- Wrong password: **Invalid credentials.**

Matches directive: no fake Apple/Google buttons present on production today.

### Live probes (AUTH-0, 2026-09-29 ~3:45 AM CT)

| Check | Result |
| --- | --- |
| `GET /healthz` | 200 |
| HTML `GET /` | 302 → `/login` |
| `GET /login` | 200; contains Sign In + Private beta |
| `GET /signup` | 200; Create Account |
| `POST /signup` (form) | 403; Private beta closed |
| `POST /login` wrong creds | 200; Invalid credentials |
| `GET /api/cctv/sources` | 401 |
| `GET /api/session` | 401 (no cookie) |
| Unit tests | **13/13 pass** |

### Owner account path — verified (without exposing secrets)

1. Fly secrets `LOGIN_USER` / `LOGIN_PASS` / `SESSION_SECRET` are **Deployed**.
2. Production auth unit tests exercise `createEnvAdminStore` + session issue /
   verify / logout / rate limit / closed signup — all green.
3. Prior live QA (`screenshots/login-live/login-report.json`, 2026-09-28
   ~4:06 PM CT): full sign-in → `ee_session` HttpOnly/Secure/SameSite=Lax →
   API 200 → LOG OUT → signed out. That path is the same code still on v31
   (UX-1/UX-2 deploys did not change `server/production/*` auth modules).
4. Live wrong-password and closed-signup still behave correctly on v31.

**Live owner password POST was not re-run from this agent** — no local
`eartheye-secrets.env` / QA credentials available on the box, and Fly secret
*values* must not be printed or scraped. Owner should spot-check Sign In once
on https://eartheye.us/login with the known password before AUTH-1 starts.

**Preserve rule for AUTH-1+:** keep env-admin (`LOGIN_*`) as a permanent
break-glass / owner path even after a DB or OAuth store is added. Never
remove or rename those secrets as part of a migration without a dual-path
window and an explicit owner drill.

---

## 3. Planned AUTH-1..8 map + gaps (derived)

> The owner directive names **AUTH-1..8** but this chat only spelled AUTH-0.
> The phase titles below are an **AUTH-0 working map** derived from the
> directive constraints + existing `users.js` seams. Replace titles when the
> owner publishes the detailed AUTH-1+ directive. Gaps remain valid either way.

| Phase | Intent (working) | Current gap |
| --- | --- | --- |
| **AUTH-0** | Audit, rollback, owner verify, docs | **Done** (this file) |
| **AUTH-1** | Durable user store scaffold **without** removing env-admin owner password | Only `createEnvAdminStore`; no DB/file user table; single hardcoded `id: 'admin'` |
| **AUTH-2** | Invite-only / gated registration (still private beta; no open public) | `/signup` UI exists but always closed; no invite tokens, allowlist, or owner-provision API |
| **AUTH-3** | Password reset via email | **No reset routes**; **no email provider** configured (see §5) |
| **AUTH-4** | Sign in with **Apple** — real only when configured | No Apple code, secrets, or Return URLs; UI correctly has **no** fake button |
| **AUTH-5** | Sign in with **Google** — real only when configured | No Google OAuth (Maps keys ≠ Sign-In); UI correctly has **no** fake button |
| **AUTH-6** | Session / CSRF / device hardening beyond SameSite+origin | No CSRF token field; revoke map is process-local; no “sessions list” / remote revoke |
| **AUTH-7** | Roles / entitlements beyond single owner | `ownerEntitlements` + audit log exist for product features; auth layer still one admin identity |
| **AUTH-8** | Production cutover drill: dual-path login, rollback rehearsal, monitoring | No AUTH cutover runbook yet; rollback image recorded here is the baseline |

**Hard gates for AUTH-1+ (from directive):**

- Do not lock owner out; keep `LOGIN_USER`/`LOGIN_PASS` working through cutover.
- Private beta — no open public registration.
- Apple/Google: show buttons **only** when credentials + redirects are real;
  otherwise **CONFIGURATION REQUIRED** + checklist (never fake buttons).
- Rollback image recorded **before** auth behavior changes (v31; this section).
- No inventing Apple/Google secrets; no paid OpenAI; Option C unchanged; no push
  unless separately approved.

---

## 4. Apple / Google — configuration required (eartheye.us)

**Do not invent secrets.** Until the owner creates real console apps, keep
buttons gated. Exact checklist for when AUTH-4 / AUTH-5 are authorized:

### Shared app facts

| Item | Value |
| --- | --- |
| Production hosts | `https://eartheye.us`, `https://www.eartheye.us` |
| Fly app hostname (redirect away) | `eartheye.fly.dev` → 308 to `eartheye.us` |
| Suggested callback base | `https://eartheye.us` (prefer apex; mirror www if both used for login) |
| Suggested Apple Return URL | `https://eartheye.us/auth/apple/callback` |
| Suggested Google redirect URI | `https://eartheye.us/auth/google/callback` |
| Suggested www twins (if login served on www) | `https://www.eartheye.us/auth/apple/callback`, `https://www.eartheye.us/auth/google/callback` |

### Apple Sign In — owner must create (AUTH-4)

1. Apple Developer → Identifiers → **App ID** with Sign In with Apple.
2. **Services ID** (web) — e.g. `us.eartheye.web` — enable Sign In with Apple.
3. Domains: `eartheye.us`, `www.eartheye.us`.
4. Return URLs: exact callback URLs above (HTTPS only).
5. Create **Key** (Sign In with Apple) → download `.p8` once; note Key ID + Team ID.
6. Fly secrets (names only — values from Apple, never invented):
   - `APPLE_CLIENT_ID` (Services ID)
   - `APPLE_TEAM_ID`
   - `APPLE_KEY_ID`
   - `APPLE_PRIVATE_KEY` (PEM contents of `.p8`)
7. UI rule: if any required secret missing → **CONFIGURATION REQUIRED** panel
   with this checklist; **no** disabled-looking Apple button that implies it works.

### Google Sign-In / OAuth — owner must create (AUTH-5)

1. Google Cloud Console project (can be separate from Maps).
2. OAuth consent screen (External or Internal as appropriate for private beta).
3. OAuth **Web client** credentials.
4. Authorized JavaScript origins: `https://eartheye.us`, `https://www.eartheye.us`.
5. Authorized redirect URIs: exact callback URLs above.
6. Fly secrets (names only):
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
7. **Do not reuse** `GOOGLE_MAPS_*` / Places keys as OAuth Sign-In credentials.
8. Same UI rule: missing config → **CONFIGURATION REQUIRED** + checklist; no fake button.

### Verification after real secrets exist

- Callback 200/302 on success; unknown state → safe error; no account auto-open
  for arbitrary Google/Apple subjects while private beta (tie to invite /
  allowlist / owner link — AUTH-2).
- Owner password path still works in parallel.

---

## 5. Email provider gap (password reset — AUTH-3)

| Need | Current state |
| --- | --- |
| Transactional email (reset links) | **None** — no SMTP, Resend, Postmark, SES, or similar secret on Fly |
| Reset routes (`/forgot`, `/reset`) | **Absent** |
| Token store for reset | **Absent** |
| From-address / DNS (SPF/DKIM) for `eartheye.us` | **Not set up for app mail** |

AUTH-3 blockers before coding reset:

1. Owner picks a provider (prefer one with a free or low tier; no new spend
   without approval).
2. Set Fly secrets (example names): `EMAIL_PROVIDER`, `EMAIL_API_KEY`,
   `EMAIL_FROM=noreply@eartheye.us` (or chosen domain).
3. DNS: SPF/DKIM/DMARC for the from-domain.
4. Reset must not reveal whether an email exists (same response either way).
5. Env-admin owner (`LOGIN_*`) may not have an email identity today — decide
   whether reset applies only to DB users while owner keeps password via Fly
   secrets / `fly secrets set LOGIN_PASS=...`.

Until then: document “password reset unavailable”; owner rotates via Fly
secrets (invalidates all sessions via credential version — intentional).

---

## 6. Risk notes

| Risk | Severity | Mitigation |
| --- | --- | --- |
| AUTH migration removes/breaks `LOGIN_*` | **Critical** — owner lockout | Dual-path: env-admin always authenticates; feature-flag OAuth/DB; rollback image v31 ready |
| Open registration by mistake | High | Keep `createClosedRegistration()` until AUTH-2 invite system ships; test `POST /signup` → 403 |
| Fake Apple/Google buttons | Medium (trust + App Store review) | Gate on real secrets; CONFIGURATION REQUIRED copy |
| Email reset without provider | Medium | Do not ship reset UI that sends nothing; close gap in AUTH-3 first |
| Session revoke lost on restart | Low–medium | Accept for single machine; AUTH-6 may add durable revoke / shorter TTL |
| Parallel UX agent touching nearby files | Medium (merge conflict) | AUTH scope = `server/production/{session-auth,users,login-page,app}.js` + auth docs/tests; avoid `src/atlas/*` |
| Half-set `LOGIN_USER` without pass | High (boot fail) | Existing boot check; never deploy one without the other |
| Printing secrets in logs/docs | Critical | Digests/names only; QA via env vars not committed files |
| Option C / volume churn during auth deploy | Medium | AUTH deploys use `--ha=false`; do not destroy `eartheye_data` |
| CSRF beyond Origin/Referer | Low today (SameSite=Lax + form POST) | AUTH-6 may add token if cookie cross-site posture changes |

---

## 7. AUTH-0 exit criteria

- [x] Directive saved: `earth-eye-spec/AUTH_DIRECTIVE_2026-09-29.md` + docs mirror
- [x] Login/create screenshots saved under `auth-screenshots/`
- [x] Current session-auth / login / users audited (this doc §2)
- [x] Rollback recorded: git tip + Fly **v31** image + revert commands (§1)
- [x] Owner path sanity: secrets present, tests 13/13, live gate behavior OK;
      owner manual password spot-check recommended before AUTH-1
- [x] Gaps vs AUTH-1..8, Apple/Google checklist, email gap, risks written
- [x] **No** auth migration; **no** push; **no** AUTH-0 Fly deploy (docs-only)
- [x] Option C unchanged; no Apple/Google secrets invented; no paid OpenAI

**Next:** AUTH-1 only after owner confirms this audit + successful password
login on https://eartheye.us/login.

---

## 8. File index

| Path | Purpose |
| --- | --- |
| `docs/AUTH_DIRECTIVE_2026-09-29.md` | Owner directive mirror |
| `docs/AUTH0_AUDIT.md` | This audit |
| `docs/auth-screenshots/` | Sign In / Create Account / invalid |
| `/workspace/earth-eye-spec/AUTH_DIRECTIVE_2026-09-29.md` | Spec-tree copy |
| `/workspace/earth-eye-spec/AUTH0_AUDIT.md` | Spec-tree audit copy |
| `/workspace/earth-eye-spec/auth-screenshots/` | Spec-tree screenshots |
| `server/production/session-auth.js` | Session + limiter |
| `server/production/users.js` | Env admin + closed registration |
| `server/production/login-page.js` | HTML chrome |
| `server/production/app.js` | Route wiring |
| `src/tooling/productionAuth.test.mjs` | Auth regression suite |
