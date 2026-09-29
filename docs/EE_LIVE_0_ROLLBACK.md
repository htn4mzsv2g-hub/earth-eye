# EE-LIVE-0 — Safe rollback record (Live World / Audit Remediation)

**Recorded:** 2026-09-29 5:23 AM CDT (America/Chicago)  
**Slice:** EE-LIVE-0 only — documentation / state capture. **No deploy. No Phase 1 code fixes.**  
**Directive:** [`LIVE_WORLD_AUDIT_REMEDIATION_FULL_2026-09-29.md`](../../earth-eye-spec/LIVE_WORLD_AUDIT_REMEDIATION_FULL_2026-09-29.md) (earth-eye-spec) / pointer [`LIVE_WORLD_AUDIT_REMEDIATION_2026-09-29.md`](../../earth-eye-spec/LIVE_WORLD_AUDIT_REMEDIATION_2026-09-29.md)

## Production tip (do not disturb)

| Item | Value |
| --- | --- |
| App | `eartheye` (org `personal`) |
| Hostname | https://eartheye.us / https://www.eartheye.us (`eartheye.fly.dev` allowlisted away) |
| Fly release | **v44** (complete) |
| Fly image (current tip / rollback target) | `registry.fly.io/eartheye:deployment-01M3P9HQVJXPVTM52MJJCR40GE` |
| Machine | `28654321fd7928` (`proud-water-4069`), `dfw`, `shared-cpu-1x` 512 MB, **started**, checks **1/1 passing** |
| Machine last updated | 2026-09-29 **4:58:21 AM CT** (2026-09-29T09:58:21Z) |
| Volume | `vol_458pq531kp61x784` (`eartheye_data` 1 GB dfw, encrypted, attached) — Option C KEEP |
| Health | `GET https://eartheye.us/healthz` → `{"ok":true}` (uptime ~1469s at record); unauthenticated `/` → **401** (auth gate intact) |
| flyctl | v0.4.109 linux/amd64 |
| Fly auth used | `HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly …` (config in `/home/box/.fly/config.yml`; env `FLY_API_TOKEN` alone sees empty org) |

### Recent Fly releases (image refs)

| Release | Image |
| --- | --- |
| **v44** (current) | `registry.fly.io/eartheye:deployment-01M3P9HQVJXPVTM52MJJCR40GE` |
| v43 | `registry.fly.io/eartheye:deployment-01M3P7VT8E2EYKAY0G1CSV7DAR` (same as v42 Path A Photoreal key-OFF) |
| v42 | `registry.fly.io/eartheye:deployment-01M3P7VT8E2EYKAY0G1CSV7DAR` |
| v41 | `registry.fly.io/eartheye:deployment-01M3P7H3W5449CGHRAQ6GZ0KEZ` |
| v40 | `registry.fly.io/eartheye:deployment-01M3P79G8X52WGH2JNRMNHAFJW` (keyless Esri tip / Photoreal rollback) |

## Local git (`/workspace/atlas-eye`)

| Item | Value |
| --- | --- |
| Branch | `stage5-incident-workspaces` |
| HEAD SHA | `b48f4b026ec1d2ed31c01520a906f4639bdba895` |
| HEAD subject | `docs: Path A Fly v42; hybrid overlay deferred until Photoreal verified` (2026-09-29 4:29:00 AM CT) |
| Dirty | **Yes** — uncommitted local changes (reviewer access / auth / docs). Not a clean tip. |

### Dirty paths at record time (names only)

- Modified: `.dockerignore`, `.env.example`, `.gitignore`, `DEPLOY_FLY.md`, `server/production/app.js`, `server/production/policy.js`, `server/production/session-auth.js`, `server/production/users.js`, `src/tooling/productionAuth.test.mjs`
- Untracked: `docs/REVIEWER_ACCESS.md`, `docs/REVIEWER_HANDOFF.md`
- Local secrets file present: `.reviewer-cred.local` (gitignored) — **do not commit / do not print**

**Note:** Production **v44** image is newer than committed HEAD `b48f4b0` (Path A v42 docs). Treat **Fly v44 image** as the authoritative production tip for rollback; local dirty tree is WIP relative to that tip. Do not `git reset --hard` against production without an explicit owner decision.

## Restore this production tip (rollback after a later bad deploy)

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3P9HQVJXPVTM52MJJCR40GE
```

Prior Path A key-OFF tip (if needed):

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3P7VT8E2EYKAY0G1CSV7DAR
```

## Database / volume / schema state

No SQL schema migration layer observed on volume. Persistent layout under `/data` (Option C):

| Path | State at record |
| --- | --- |
| `/data/collection/` | ~356K — `_health.json`, `nws-weather-alerts.json`, `usgs-earthquakes.json` (continuous collection) |
| `/data/audit/` | `owner-audit.jsonl` (~1906 bytes) |
| `/data/auth/` | **empty** (env-based owner + reviewer accounts; no on-disk user DB) |
| `/data/lost+found/` | present (volume mkfs) |

Collection health snapshot (sanitized): USGS earthquakes feed healthy (`consecutiveFailures: 0`, `records: 263`, interval 60s). Full `_health.json` left on volume.

Redeploy does **not** erase volume data. Destroying the volume would.

## Secrets (names only — digests from `fly secrets list`)

Present and Deployed: `ALLOWED_HOSTS`, `LOGIN_USER`, `LOGIN_PASS`, `SESSION_SECRET`, `TOMTOM_API_KEY`, `REVIEWER_USER`, `REVIEWER_PASS`.

### Owner / reviewer — DO NOT TOUCH

- **Reviewer secrets are present** (`REVIEWER_USER` / `REVIEWER_PASS`). Leave them alone for EE-LIVE-0.
- **DO NOT touch `LOGIN_USER` / `LOGIN_PASS` / `SESSION_SECRET`.** Do not rotate, unset, re-import, or print values.
- Do not disturb the owner account. Do not enable billing / Photoreal build secrets in this slice.

## Tests recorded (EE-LIVE-0)

```text
cd /workspace/atlas-eye && node --test src/tooling/productionAuth.test.mjs
# 27 pass / 0 fail — 2026-09-29 ~5:22 AM CDT
```

Representative coverage: sign-in gate, session cookies, rate limit, private-beta closed signup, AUTH-1/2/5/6/8, reviewer env store + owner break-glass gating.

## Explicit non-actions this slice

- No `fly deploy`
- No Phase 1 defect fixes (SYNCING ROAD NETWORK, LOADING FRAMES, Austin TZ, CT CT, ADS-B contradiction, dead controls)
- No IA / LIVE EARTH / camera / Analyst / Events code
- No secret changes

## Success criteria for EE-LIVE-0

Rollback image, SHA/dirty status, volume layout, secret *names*, and auth test results are written here so Phase 1+ can proceed incrementally with a known restore point.
