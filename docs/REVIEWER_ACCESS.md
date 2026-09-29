# Temporary reviewer access (env account)

Earth Eye production can expose an **optional second account** for critique
(ChatGPT or a human reviewer) without sharing the owner `LOGIN_USER` /
`LOGIN_PASS` break-glass credentials.

Registration stays closed. Owner break-glass is unchanged.

## Secrets (Fly)

Both or neither (half-set refuses to boot):

| Variable | Required | Notes |
| --- | --- | --- |
| `REVIEWER_USER` | with `REVIEWER_PASS` | Exact username (case-sensitive). |
| `REVIEWER_PASS` | with `REVIEWER_USER` | Strong random password. |
| `LOGIN_USER` / `LOGIN_PASS` | yes when reviewer is set | Owner account; still required for auth mode. |
| `SESSION_SECRET` | recommended | ≥32 chars so sessions survive restarts. |

Set (example — use your own values; never commit them):

```bash
# From a private local file, or one-shot:
fly secrets set REVIEWER_USER=ee-reviewer REVIEWER_PASS='…' -a eartheye
```

App: `eartheye`. Sign-in URL: `https://eartheye.us/login`.

## Giving access to ChatGPT / a reviewer

1. Confirm `REVIEWER_USER` / `REVIEWER_PASS` are set on Fly (`fly secrets list -a eartheye` shows names only).
2. Relay **once** over a secure channel:
   - URL: `https://eartheye.us/login`
   - Username: the `REVIEWER_USER` value (e.g. `ee-reviewer`)
   - Password: from your private credential file (never paste into git, issues, or this doc)
3. Ask them to use GLOBE / TRACK / CAMERAS / ANALYST / MORE for critique only.

On the agent box, credentials for the temporary account (if generated here) live
only in `/workspace/atlas-eye/.reviewer-cred.local` (gitignored, mode 600).

## What the reviewer can and cannot do

**Can:** sign in with the reviewer env pair; use the globe UI and authenticated
`/api/*` data routes that any signed-in session may call (layers, map, cameras,
analyst tools that are not owner-gated).

**Cannot (server-gated):**

- `GET /api/atlas/owner-summary`
- `/api/atlas/audit-log`
- Workspace writes (`POST`/`PUT`/`DELETE` `/api/atlas/workspaces…`)
- Change Fly secrets, rotate `LOGIN_PASS`, or enable billing (no in-app path)

**Keys / capabilities (EE-LIVE-2):** Reviewers may call
`GET /api/atlas/capabilities` (sanitized labels only — no env names or secret
values). `GET /api/atlas/provider-status` is **owner-only** (403 for reviewer).
POWER UP key editing remains dev-only and does not write Fly secrets.
Compromising the reviewer password still does **not** yield `LOGIN_PASS`.
Role is exposed on `GET /api/session` (`role` / `userId`); the Keys UI shows
sanitized capabilities when `role !== 'owner'`.

## Revoke

```bash
fly secrets unset REVIEWER_USER REVIEWER_PASS -a eartheye
```

Fly applies secret changes by restarting machines. If a machine is stopped
(`min_machines_running = 0`), the next start picks up the unset. To force
immediately:

```bash
fly machines restart -a eartheye
# or
fly deploy -a eartheye --ha=false
```

After unset + restart, reviewer sign-in fails; existing reviewer sessions stop
verifying because `credentialVersion` for id `reviewer` disappears. Owner
`LOGIN_*` is untouched.

## Code pointers

- `server/production/users.js` — `createEnvReviewerStore`, `createCompositeUserStore`, `REVIEWER_ROLE`
- `server/production/session-auth.js` — `resolveReviewerConfig`
- `server/production/app.js` — composite wiring + `isOwnerOnlyApi`
