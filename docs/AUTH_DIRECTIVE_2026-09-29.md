# EARTH EYE — PRODUCTION AUTHENTICATION REBUILD
# Ruben (owner) 2026-09-29 ~3:43 AM CT — controlling AUTH directive.
# Full owner chat text + login/create screenshots are authoritative.
# Screenshots: auth-screenshots/ (live eartheye.us Sign In + Create Account).
#
# SCOPE GUARD (do not violate):
# - Do NOT redesign globe / providers / Analyst / cameras / tracking / nav / scenes.
# - Do NOT lock the owner out.
# - Create rollback BEFORE any auth behavior changes.
# - Preserve owner password access (LOGIN_USER / LOGIN_PASS env admin path).
# - Private beta — no open public registration.
# - No fake Apple / Google buttons — gate with CONFIGURATION REQUIRED + exact
#   credential/redirect checklist for eartheye.us.
# - No push unless separately approved. Option C unchanged.
# - No paid OpenAI. No inventing Apple/Google secrets.
# - Parallel UX work may run on another agent — avoid colliding edits on auth
#   files when possible; auth is AUTH-agent scope.
#

## Owner directive (full chat text)

OWNER DIRECTIVE: PRODUCTION AUTHENTICATION REBUILD — full text in chat +
login/create screenshots. Save to /workspace/earth-eye-spec/AUTH_DIRECTIVE_2026-09-29.md
+ atlas-eye/docs/ mirror.

CRITICAL: Do NOT redesign globe/providers/Analyst/cameras/tracking/nav/scenes.
Do NOT lock owner out. Create rollback BEFORE auth changes. Preserve owner
password access. Private beta — no open public registration. No fake
Apple/Google buttons — gate with CONFIGURATION REQUIRED + exact
credential/redirect checklist for eartheye.us.

START AUTH-0 only (quality-first, fast):
1) Audit current session-auth / login / users
2) Record rollback (git tip + Fly image/tag + how to revert)
3) Verify owner account path still works
4) Write docs/AUTH0_AUDIT.md: current model, gaps vs AUTH-1..8, Apple/Google
   config needed, email provider gap for reset, risk notes
5) Do NOT migrate yet; AUTH-1+ only after AUTH-0 documented + owner still can login

Parallel UX work may be on another agent — avoid colliding edits on auth files
if possible; auth is your scope.
No push. Option C unchanged. No paid OpenAI. No inventing Apple/Google secrets.
Deploy AUTH-0 only if docs-only or safe non-breaking. Prefer docs + rollback first.

## Screenshots (authoritative UI evidence)

| File | Source | What it shows |
| --- | --- | --- |
| `auth-screenshots/01-sign-in.png` | live `https://eartheye.us/login` (login-live 2026-09-28) | Sign In tab: email/username + password + Show; no Apple/Google buttons |
| `auth-screenshots/02-create-account-closed.png` | live `/signup` | Create Account tab; banner **Private beta is currently closed.**; Name/Email/Password still rendered; submit remains closed server-side |
| `auth-screenshots/03-invalid-credentials.png` | live wrong-password | **Invalid credentials.** on Sign In |
| `auth-screenshots/*-local.png` | local QA mirrors | Same chrome; kept for diffing |

Mirrored under `atlas-eye/docs/auth-screenshots/` and
`atlas-eye/docs/AUTH_DIRECTIVE_2026-09-29.md`.

## AUTH phase gate

| Phase | Status | Rule |
| --- | --- | --- |
| **AUTH-0** | **THIS** — audit + rollback record + owner-path verify + `AUTH0_AUDIT.md` | Docs / rollback only. No auth migration. No deploy required. |
| AUTH-1..8 | **Blocked** until AUTH-0 docs exist and owner can still sign in | Detailed AUTH-1+ implementation only after gate. |

## Non-goals (explicit)

- Open public self-serve registration
- Placeholder / fake Apple or Google Sign-In buttons
- Changing globe, providers, Analyst, cameras, tracking, nav, or scenes for auth
- Spend / Option C changes; inventing OAuth client secrets; paid OpenAI

## Related docs

- `atlas-eye/docs/AUTH0_AUDIT.md` — audit outcome (AUTH-0 deliverable)
- `atlas-eye/DEPLOY_FLY.md` — sign-in secrets + release history
- `atlas-eye/docs/OPTION_C_FLY.md` — Option C KEEP (unchanged)
- `server/production/{session-auth,users,login-page,app}.js` — current auth code
