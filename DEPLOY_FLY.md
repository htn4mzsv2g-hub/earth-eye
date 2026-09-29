# Deploying Earth Eye to Fly.io

Prepared 2026-09-28 CT. **Deployed 2026-09-28 CT** (spend approved by Ruben).

## Current deployment

**Option C KEEP** (Ruben 2026-09-29): always-on + 1 GB `eartheye_data`
(`vol_458pq531kp61x784`) + daily snapshots (5-day). Details:
`docs/OPTION_C_FLY.md`. Est. ~$4.20/mo. No further spend changes.


- **Live at https://eartheye.us/ and https://www.eartheye.us/** (Stage 2 v8
  2026-09-29 ~1:12 AM CT). App `eartheye`, org `personal`, one machine
  (`83695dc7759698`), `shared-cpu-1x` 512 MB, `dfw`, auto stop/start, no
  volumes. Keyless (no Cesium/Google build secrets, no provider runtime keys).
- Secrets set: `LOGIN_USER`, `LOGIN_PASS`, `SESSION_SECRET` (in-app sign-in
  page on; see "Sign-in" below) and `ALLOWED_HOSTS=eartheye.us,www.eartheye.us`
  (action: default `redirect`). The first deploy used HTTP Basic auth
  (`BASIC_AUTH_USER` / `BASIC_AUTH_PASS`); that path is gone and those two
  secrets were unset when the sign-in page shipped.
- Sign-in page deployed 2026-09-28 ~4:06 PM CT (machine version 3, still one
  machine, check passing). Verified live on both hostnames: unauthenticated
  `/` → `302 /login` (200 HTML sign-in page), `/api/cctv/sources` → `401` JSON,
  no `WWW-Authenticate` anywhere; wrong and old credentials → "Invalid
  credentials."; the new credentials → `ee_session` (HttpOnly, Secure,
  SameSite=Lax) and `200` on `/` and `/api/cctv/sources`; `POST /logout`
  revokes; `POST /signup` → "Private beta is currently closed."; `/terms`,
  `/privacy`, `/healthz` 200; `eartheye.fly.dev` → `308`. iPhone-emulation
  screenshots in `screenshots/login-live/` (gitignored).
  https://eartheye.fly.dev/ now answers GET/HEAD with `308 → https://eartheye.us/<path>`
  and other methods with `421`; `/healthz` stays `200` on every host (it runs
  before the allowlist, so Fly's `/healthz` check keeps passing).
- IPs: shared IPv4 `66.241.125.28` (free), dedicated IPv6
  `2a09:8280:1::19f:59b0:0` (free). No dedicated IPv4.
- Certificates (Let's Encrypt, verified and active, expire ~2026-12-27):
  `www.eartheye.us` RSA + ECDSA; `eartheye.us` ECDSA (RSA may follow).
- Checked after the domain switch (then still Basic auth): both hostnames `401`
  without login and `200` with login on `/` and `/api/cctv/sources`; `http://` → `301` to `https://`;
  Fly check passing; still one machine. Headless-browser check (emulated
  iPhone 390×844 and desktop 1440×900): globe renders, no page errors
  (`screenshots/domain-live/`, gitignored, local only).

### Release history and rollback points

**Current globe rollback (2026-09-29 ~9:34 AM CT).** Owner confirmed physical iPhone drag and pinch. Same block as `docs/ROLLOUT_KNOWN_GOOD.md`, `HANDOFF.md`, `docs/IPHONE_GLOBE_RELEASE_MAP.md`, and PR #3. Do not redeploy to record it. The table below is older history, not the current tip.

```text
FINAL HANDOFF — verify before further changes. Do not redeploy Fly.

1. Branch name: cursor/restore-preaudit-globe-444e
2. Tag name: known-good/iphone-globe-v66-b846a3e
3. Full commit SHA: b846a3e0557bc879142aef69c2babd812757a9fc
4. Rollback command: fly deploy -a eartheye --ha=false --image registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z

Fly release: v66
BUILD_ID: git-b846a3e-202609290929
Image: registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z
Image digest: sha256:b0ce45ef7a4386b850238fbc8161c3618bb8822891cf363d70c5ee7987618824
```

| Fly release | Image | Deployed (CT) | Code |
| --- | --- | --- | --- |
| v27 | `registry.fly.io/eartheye:deployment-01M3P3RRB0N4GNE1HYMGEMWSXR` | 2026-09-29 3:30 AM | iPhone perf wave 4 + Stage 5 matrix QA (`4561fb9`) |
| v26 | `registry.fly.io/eartheye:deployment-01M3P3KHJ3M3TR1PB47JQ0ZENB` | 2026-09-29 3:25 AM | iPhone lag root-cause perf wave 3 (`ce61958`) |
| v25 | `registry.fly.io/eartheye:deployment-01M3P3E6VJDYQJF017QPQWGGDA` | 2026-09-29 3:20 AM | Stage 5.4/5.5 audit log + entitlements/CSP hardening (`e0886f4`) |
| v24 | `registry.fly.io/eartheye:deployment-01M3P391YT9CAX56QSBD8JTY9D` | 2026-09-29 3:10 AM | NAV-2 TomTom Orbis routeProvider NEEDS_KEY (`c8c40db`) |
| v23 | `registry.fly.io/eartheye:deployment-01M3P32FM14CPM8HV9N0QF1Z7G` | 2026-09-29 3:04 AM | Stage 5.3 permitted history / entitlements (`bcad80d`) |
| v22 | `registry.fly.io/eartheye:deployment-01M3P2SYG9W7NVZM8FG84T9FFT` | 2026-09-29 3:00 AM | Stage 5 workspaces / incident brief / NAV-0 (`stage5-incident-workspaces` @ `d7193f0`) |
| v21 | `registry.fly.io/eartheye:deployment-01M3P26BJ9B8YS4PH2HZ3635ME` | 2026-09-29 2:49 AM | OpenFreeMap installations + open-DEM + COMMS-0 (`89e8678` / tip `43bb8da`) |
| v20 | `registry.fly.io/eartheye:deployment-01M3P1A8YMNKHGKKA50HE1XMFR` | 2026-09-29 2:34 AM | Stage 4 packs/OMM (`stage4-sources-omm` @ `aa9ce2c` / feature `534f055`) |
| v12 | `registry.fly.io/eartheye:deployment-01M3NXJHQYPZMN6DKEX0GNK08N` | 2026-09-29 1:28 AM | Option C KEEP + snapshots; Stage 3/4 code |
| v8 | `registry.fly.io/eartheye:deployment-01M3NWM0S7QZJD42N96EEK2XJ0` | 2026-09-29 1:12 AM | Stage 2 (`stage2-registry-health` @ `7e60722`) — wake-time collection; auto-stop unchanged |
| v7 | `registry.fly.io/eartheye:deployment-01M3NP74GRYB7T6M59TY3R9PA2` | 2026-09-28 11:19 PM | Stage 1 final (`main` = `stage1-mobile-registry` @ `2324dca`) |
| v6 | `registry.fly.io/eartheye:deployment-01M3NGFC21VFRSYRTN4QSDQW43` | 2026-09-28 9:40 PM | Stage 1 intermediate (`eb89896`) |
| v5 | `registry.fly.io/eartheye:deployment-01M3N3D0GYAV8S5T9R50VHWG98` | 2026-09-28 5:45 PM | working tree that became `837e907` (**Stage 1 rollback point**) |

Roll back Stage 1 (same single machine, no new cost):

```bash
env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3N3D0GYAV8S5T9R50VHWG98
git checkout 837e907   # matching source
```

v7 checked live 2026-09-28 ~11:20 PM CT: one machine `83695dc7759698`, check
1/1 passing, shared IPv4 only, no volumes; `/healthz` 200 on both hostnames;
browser `/` → `302 /login`, non-browser `/` and `/api/*` → `401` JSON; no
`WWW-Authenticate` on any path; `eartheye.fly.dev` → `308`; `POST /signup` →
`403`. Stage 1 QA results: `docs/STAGE1_REPORT.md`.









v27 deployed 2026-09-29 ~3:30 AM CT (`4561fb9`): mobile SSE/tile-cache tuning,
hidden-tab status pause, Stage 5 matrix QA 52/0. Rollback: v26
`deployment-01M3P3KHJ3M3TR1PB47JQ0ZENB`.

v26 deployed 2026-09-29 ~3:25 AM CT (`ce61958`): mobile GPU profile (MSAA1/30fps),
height-sync coalesce, lazy webrtlsdr. Physical iPhone checklist still open.
Rollback: v25 `deployment-01M3P3E6VJDYQJF017QPQWGGDA`.

v25 deployed 2026-09-29 ~3:20 AM CT (`e0886f4`): owner audit log, entitlements
(billing/admin UI false), CSP audit endpoints. Option C unchanged. Rollback: v24
`deployment-01M3P391YT9CAX56QSBD8JTY9D`.

v24 deployed 2026-09-29 ~3:10 AM CT (`c8c40db`): NAV-2 pluggable /api/route
(TomTom Orbis free-tier when key set; else OSRM DEMO_FAIR_USE). Monthly caps
wired. **No TOMTOM_API_KEY on Fly yet** — owner installs next. Mapbox not
wired. Rollback: v23 `deployment-01M3P32FM14CPM8HV9N0QF1Z7G`.

v23 deployed 2026-09-29 ~3:04 AM CT (`bcad80d`): Stage 5.3 permitted history API,
retention gates, NWS collection, adsbdb routes memory-only, owner entitlements prep.
Option C unchanged. Rollback: v22 `deployment-01M3P2SYG9W7NVZM8FG84T9FFT`.

v22 deployed 2026-09-29 ~3:00 AM CT (`d7193f0` on `stage5-incident-workspaces`):
incident workspace Analyst tool, `/api/atlas/workspaces`, owner-summary, NAV-0
audit (TomTom Orbis #1 / Mapbox #2 roadmap only — no keys). Option C unchanged.
Verified on eartheye.us: healthz 200; `/` 401; signup 403; owner-summary /
workspaces / collection-health 401. Rollback: v21 image
`deployment-01M3P26BJ9B8YS4PH2HZ3635ME`.

v21 deployed 2026-09-29 ~2:49 AM CT (`89e8678`): OpenFreeMap military
installations (no traffic/ALPR), bundled OSM name index, open-DEM 1942/1942,
COMMS-0 stub (Broadcastify HELD / empty feeds when authenticated). Option C
unchanged. Verified: healthz 200, HTML `/` → 302 `/login`, signup 403,
collection-health 401. Rollback: v20 image
`deployment-01M3P1A8YMNKHGKKA50HE1XMFR`.

v20 deployed 2026-09-29 ~2:34 AM CT (`aa9ce2c` tip / feature `534f055`): Stage 4
Lake County / Singapore / ALERTCalifornia+HPWREN (NC) packs, CelesTrak OMM JSON
fix, mail.ru Overpass drop. Auth: host whoami `rmontez1995@gmail.com` via
`env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN` (do not use `/workspace/fly-api-token.txt`).
Live checks: `/healthz` 200; browser `Accept: text/html` `/` → `302 /login` (200);
`POST /signup` → `403` private beta closed; `/api/atlas/collection-health` → `401`
auth gate (endpoint live); `eartheye.fly.dev` → `308`/`421`; machine
`28654321fd7928` v20 started, check 1/1, volume `vol_458pq531kp61x784`, Option C
unchanged (`auto_stop=off`, `min_machines_running=1`). Rollback image: prior
v19 `deployment-01M3P03BQD7HJDTBPAT80R9NXB` or Stage 1 v5. Never touch
lunara/lunara-plus/rv-parts-match/tooldeal-board. Packs remain env-gated.
No remote push. No new spend.

v8 deployed 2026-09-29 ~1:12 AM CT (`7e60722`): Stage 2 registry/health + wake-time
server collection (`GET /api/atlas/collection-health`, `continuousClaim: false`).
Live probe: USGS feed ~213 records while awake; NHC/FIRMS adapters deferred;
review queue length 2. **Fly auto-stop / min_machines_running=0 / no volumes
unchanged** — continuous collection is not 24/7 until Ruben approves spend
(options in `docs/STAGE2_REPORT.md`). Rollback to v7 image remains available.


GoDaddy DNS in place (parked `A @` 15.197.148.33 / 3.33.130.190 and
`CNAME www → eartheye.us` deleted; no CAA exists):

| Type  | Name                  | Value                                | TTL    |
| ----- | --------------------- | ------------------------------------ | ------ |
| A     | `@`                   | `66.241.125.28`                      | 1 hour |
| AAAA  | `@`                   | `2a09:8280:1::19f:59b0:0`            | 1 hour |
| A     | `www`                 | `66.241.125.28`                      | 1 hour |
| AAAA  | `www`                 | `2a09:8280:1::19f:59b0:0`            | 1 hour |
| CNAME | `_acme-challenge`     | `eartheye.us.d6lmmxg.flydns.net`     | 1 hour |
| CNAME | `_acme-challenge.www` | `www.eartheye.us.d6lmmxg.flydns.net` | 1 hour |

(As of 2026-09-28 the `_acme-challenge.www` CNAME did not resolve (NXDOMAIN
at GoDaddy's nameservers). The www certificate was issued anyway because www
already points at Fly; add the record so DNS-01 renewals have a fallback.)

(Alternative for www: `CNAME www → d6lmmxg.eartheye.fly.dev` instead of the
www A/AAAA. `_fly-ownership` TXT `app-d6lmmxg` is only needed behind a proxy/CDN.)

What is ready in the repo:

| File                  | Purpose                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/prod.mjs`     | Production server (`npm start`): plain `node:http`, serves `dist/`, mounts the same API handlers as `vite dev`/`vite preview`. No Vite at runtime.       |
| `server/production/*` | Connect-compatible stack, static files (MIME, cache, br/gzip, SPA fallback), request policy (headers, allowlist, logins, rate limits).                   |
| `Dockerfile`          | Multi-stage `node:24-slim`: `npm ci` → `npm run build` → `npm prune --omit=dev` → runs `node server/prod.mjs` as user `node` on port 8080.               |
| `.dockerignore`       | Keeps `.env*`, `node_modules`, `dist`, `.git`, screenshots and caches out of the build context.                                                          |
| `fly.toml`            | `dfw`, internal port 8080, `force_https`, `/healthz` check, one `shared-cpu-1x` 512 MB machine, auto stop/start, `min_machines_running = 0`, no volumes. |

## Production server settings (environment)

All optional. Every gate is **off** unless its variable is set.

| Variable                                    | Default            | Effect                                                                                                                                                                                       |
| ------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT` / `HOST`                             | `8080` / `0.0.0.0` | Listen address. For a local-only run use `HOST=127.0.0.1 npm start`.                                                                                                                         |
| `ALLOWED_HOSTS`                             | off                | Comma list, e.g. `eartheye.us,www.eartheye.us`. Other `Host` headers (e.g. `<app>.fly.dev`) get a 308 to the first host (GET/HEAD) or 421.                                                   |
| `ALLOWED_HOSTS_ACTION`                      | `redirect`         | `redirect` or `reject` (421 for everything).                                                                                                                                                 |
| `LOGIN_USER` + `LOGIN_PASS`                 | off                | Turns on the in-app sign-in page (see "Sign-in" below). Both or neither (half-set refuses to boot). Legacy names `BASIC_AUTH_USER` + `BASIC_AUTH_PASS` are still read if `LOGIN_*` is unset. |
| `REVIEWER_USER` + `REVIEWER_PASS`           | off                | Optional second env account for temporary critique (ChatGPT / human reviewer). Both or neither; requires `LOGIN_*`. See `docs/REVIEWER_ACCESS.md`. Compromising reviewer does not yield `LOGIN_PASS`. |
| `SESSION_SECRET`                            | per-process random | HMAC key for the `ee_session` cookie, ≥32 characters. Set it so sessions survive restarts / auto-stop; without it every restart signs everyone out.                                          |
| `ORIGIN_AUTH_HEADER` + `ORIGIN_AUTH_SECRET` | off                | Require a secret header on every request, e.g. one a Cloudflare Transform Rule adds, so the Fly hostname/IP cannot bypass Cloudflare Access.                                                 |
| `RATE_LIMIT_API_PER_MIN`                    | `1200`             | Per client IP, all `/api/*` (0 = off).                                                                                                                                                       |
| `RATE_LIMIT_METERED_PER_MIN`                | `20`               | Per client IP, `/api/google/*`, `/api/openai/*`, `/api/realtime/token` (0 = off). The existing `GEV_RATELIMIT_OPENAI_PER_MIN` / `GEV_RATELIMIT_GOOGLE_PER_MIN` still apply on top.           |
| `API_MAX_BODY_BYTES`                        | `1048576`          | Larger API request bodies get 413; unsized chunked bodies get 411.                                                                                                                           |
| `TRUST_PROXY` / `TRUST_PROXY_HEADER`        | auto on Fly        | On Fly (`FLY_APP_NAME` set) the client IP comes from `Fly-Client-IP` and HTTPS from `X-Forwarded-Proto`. `X-Forwarded-For` is never trusted.                                                 |
| `REALTIME_DEBUG_LOG`                        | off                | `1` re-enables the voice debug sink's disk writes (off on a public host: accepted and discarded).                                                                                            |
| `SHUTDOWN_GRACE_MS`                         | `8000`             | Drain time after SIGTERM/SIGINT before open connections are cut.                                                                                                                             |
| `TLE_AMSAT_FALLBACK`                        | off                | `1` lets the satellites layer use AMSAT TLEs for the stations group when CelesTrak is unreachable (labelled FALLBACK, not CelesTrak). Off: the layer says CelesTrak is unavailable.        |
| `CCTV_STREETVIEW_FALLBACK`                  | off                | `1` lets a failed camera frame be replaced by a labelled Google Street View image (also needs `GOOGLE_MAPS_SERVER_API_KEY`, metered). Off: the viewer shows UNAVAILABLE.                     |

### Sign-in

When `LOGIN_USER`/`LOGIN_PASS` are set, the server shows its own Earth Eye
sign-in page instead of the browser's Basic-auth popup, which never appears:
no response carries `WWW-Authenticate`. Phase 1 scope: one admin account
(the secrets), registration closed.

- Pages (all self-contained HTML, plain form POSTs; no app bundle): `/login`
  (Sign In tab: "Email or username", password with an accessible Show/Hide
  toggle, Sign In), `/signup` (Create Account tab: name, email, password;
  submitting it, or any `POST /signup`, answers `403` with exactly "Private
  beta is currently closed." and nothing is read, stored or created),
  `/logout` (confirm page), `/terms` and `/privacy` (honest "coming soon. Not
  yet published." placeholders). Failed sign-ins show exactly "Invalid
  credentials." for a wrong username and a wrong password alike. Strict
  per-response nonce CSP (`default-src 'none'; style-src/script-src 'nonce-…';
form-action 'self'; frame-ancestors 'none'`); the only script is the
  Show/Hide toggle, which resets the field to `type=password` before submit
  so password managers keep working.
- Without a session, page navigations get `302 → /login?next=<path>` and
  everything else (`/api/*`, `/assets/*`, `manifest.webmanifest`, WebSocket
  upgrades) gets `401 {"error":"Authentication required"}`. Open without a
  session: the pages above, `/healthz` and the brand icons (`/favicon.svg`,
  `/favicon-32.png`, `/apple-touch-icon.png`).
- Credentials: server-side only, exact match (case-sensitive username,
  nothing trimmed from what is typed), constant-time comparison. Trailing
  whitespace/newlines are stripped from the **environment values** only (a
  secret piped from a file often ends in `\n`).
- Session: `ee_session` cookie, `HttpOnly; SameSite=Lax; Path=/`, `Secure`
  on HTTPS (behind Fly: `X-Forwarded-Proto`). Stateless HMAC-SHA256-signed
  token (random 32-byte id, account id, 30-day sliding expiry, re-issued at
  most daily) keyed by `SESSION_SECRET`. Each token carries a keyed
  credential version, so changing `LOGIN_USER` or `LOGIN_PASS` signs every
  device out.
- Sign-in POSTs must come from the same origin (Origin, else Referer, host
  check) and are limited to 10 failed attempts per IP per 15 minutes
  (`Fly-Client-IP` on Fly) with a "Too many sign-in attempts" message. Logs
  record `[auth] sign-in ok|failed ip=…` only, never a username or password.
- After sign-in the browser returns to the page it asked for (same-origin
  relative paths only; anything else goes to `/`).
- Log out: the app shows a small **LOG OUT** button in the quick-action dock
  (bottom-right on desktop, inside **MORE** on phones) whenever
  `GET /api/session` reports `{authEnabled:true, authenticated:true}`; it
  POSTs `/logout`, which clears the cookie, revokes that token for the life of
  the process and returns to the sign-in page. Local/dev servers show no
  button.
- Code: `server/production/users.js` (user-store and registration
  interfaces: today an env-backed single admin and a closed registration),
  `session-auth.js` (tokens, cookies, limiter, CSRF, redirect safety),
  `login-page.js` (pages). Forgot password, remember me, OAuth, passkeys,
  magic links, OTP/MFA, captcha, profiles, open registration and payments
  are intentionally not implemented; they would plug in behind those
  interfaces.
- Local check: `LOGIN_USER=testuser LOGIN_PASS=test-pass-123 HOST=127.0.0.1 npm start`,
  then `QA_LOGIN_USER=testuser QA_LOGIN_PASS=test-pass-123 node scripts/qa-login.mjs --url http://127.0.0.1:8080`
  (iPhone 390×844 screenshots in `screenshots/login/`, gitignored).

Setting or rotating the secrets without the values touching the command line
or shell history (values come from a private file or a password manager):

```bash
# LOGIN_USER / LOGIN_PASS from your private file; SESSION_SECRET generated and piped straight in.
{ grep -E '^(LOGIN_USER|LOGIN_PASS)=' ~/eartheye-secrets.env
  printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)"; } | fly secrets import --stage -a eartheye
fly secrets unset --stage BASIC_AUTH_USER BASIC_AUTH_PASS -a eartheye   # legacy names, if still set
fly deploy --ha=false -a eartheye
```

Always on: `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`
(the repo's existing framing policy, unchanged), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin` (keeps the Google key's
referrer restriction working), and `Strict-Transport-Security: max-age=31536000`
only on HTTPS requests in production. `GET /healthz` bypasses the allowlist,
the sign-in gate and rate limits so Fly's checks work. The sign-in page sends
its own stricter CSP (still including `frame-ancestors 'none'`).

Known behaviour behind Fly: `/api/atlas/provider-status` (the KEYS panel) keeps
its upstream admission gate, which refuses any proxied request, so on the public
site the panel cannot show set/unset. That is deliberate (not loosened); use
`fly secrets list` to see which secrets exist.

## Keys: runtime secrets vs build secrets

- **Runtime secrets** (server-side only, never sent to the browser), set with
  `fly secrets`: `AISSTREAM_API_KEY`, `FIRMS_MAP_KEY`, `TOMTOM_API_KEY`,
  `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `LL2_API_TOKEN`,
  `GOOGLE_MAPS_SERVER_API_KEY` (metered), `OPENAI_API_KEY` (metered) and any
  other `OPENAI_*` settings you use, plus `GEV_RATELIMIT_OPENAI_PER_MIN`,
  `GEV_RATELIMIT_GOOGLE_PER_MIN`. `CCTV_TFL_VIDEO_CLIPS` stays unset (off).
- **Build secrets** (browser keys, inlined into the JavaScript by Vite at build
  time): `CESIUM_ION_TOKEN`, `GOOGLE_MAPS_API_KEY`. They are passed with
  `--build-secret`, so they never sit in an image layer, but they ARE readable
  in the served JS by design. Before deploying, restrict them: Google key →
  HTTP referrers `https://eartheye.us/*`, `https://www.eartheye.us/*` and only
  the Map Tiles API; Cesium ion token → `assets:read` scope with allowed URLs
  set to the same origins. A key change needs a new `fly deploy`.
- Keep the values in a file **outside the repo** (for example
  `~/eartheye-secrets.env`, `NAME=value` per line). Never paste values into
  commits, issues or chat.

## Step by step

Run from the repo root on a machine with `flyctl` (`fly version`). Steps 1–4
cost nothing.

```bash
# 1. Log in (interactive browser login; do not reuse any old token file)
fly auth login
fly auth whoami

# 2. Create the app (free: an app with no machines bills nothing).
#    "eartheye" may be taken; pick an available name and put it in fly.toml `app`.
fly apps create eartheye            # or: fly apps create <your-name>

# 3. Runtime secrets, names only here; values come from your private file.
#    --stage stores them without starting anything.
fly secrets import --stage < ~/eartheye-secrets.env
#    (or one by one: fly secrets set --stage AISSTREAM_API_KEY=... FIRMS_MAP_KEY=... )
#    sign-in page (if Cloudflare Access is not used): LOGIN_USER, LOGIN_PASS
#    and SESSION_SECRET in the same file (see "Sign-in" above).
fly secrets list                    # shows names and digests, never values

# 4. Optional local check with Docker (free)
docker build -t eartheye:local .
docker run --rm -p 8080:8080 eartheye:local      # http://localhost:8080/healthz
```

> **⚠ Step 5 is the FIRST step that can create charges.** It needs a card on
> file (or the 7-day / 2-VM-hour free trial). From here on a machine exists:
> about $0.00555/hour while running in `dfw`, about $0.15/GB-month of image
> rootfs while stopped.

```bash
# 5. First deploy: ONE machine (--ha=false; Fly otherwise creates two).
fly deploy --ha=false \
  --build-secret CESIUM_ION_TOKEN="$(grep '^CESIUM_ION_TOKEN=' ~/eartheye-secrets.env | cut -d= -f2-)" \
  --build-secret GOOGLE_MAPS_API_KEY="$(grep '^GOOGLE_MAPS_API_KEY=' ~/eartheye-secrets.env | cut -d= -f2-)"
#    (both --build-secret flags are optional; without them the globe runs keyless)
fly status                          # expect exactly 1 machine, region dfw
fly scale count 1 --yes             # safety: pin to one machine
fly checks list                     # /healthz passing
curl -fsS https://<app>.fly.dev/healthz

# 6. IP addresses. The first deploy normally assigns a dedicated IPv6 and a
#    shared IPv4 automatically (both free). Only if missing:
fly ips list
fly ips allocate-v6                 # free
fly ips allocate-v4 --shared        # free. Do NOT run plain `fly ips allocate-v4` ($2/mo dedicated)

# 7. Certificates (first 10 hostnames per org are free; $0.10/mo each after)
fly certs add eartheye.us
fly certs add www.eartheye.us
fly certs setup eartheye.us         # prints the exact DNS records to create
fly certs setup www.eartheye.us

# 8. Create the GoDaddy DNS records (table below), then:
fly certs check eartheye.us
fly certs check www.eartheye.us     # wait for "Issued" / verified
curl -I https://eartheye.us/        # 200, security headers present
curl -I http://eartheye.us/         # 301 → https (force_https)

# 9. When a login (Cloudflare Access or the sign-in page) is in front, stop the raw
#    fly.dev hostname from bypassing it:
fly secrets set ALLOWED_HOSTS=eartheye.us,www.eartheye.us   # restarts the machine
```

### GoDaddy DNS records (domain eartheye.us)

In GoDaddy → My Products → eartheye.us → DNS. First delete GoDaddy's default
parked `A @` record and the default `CNAME www → @`. Bracketed values are only
known after steps 5–7 (`fly ips list`, `fly certs setup`).

| Type  | Name                  | Value                                                                     | TTL    | Notes                                                                                  |
| ----- | --------------------- | ------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| A     | `@`                   | `[shared IPv4 from fly ips list]`                                         | 1 hour | Shared IPv4 works for a custom domain (routing by hostname); no dedicated IPv4 needed. |
| AAAA  | `@`                   | `[dedicated IPv6 from fly ips list]`                                      | 1 hour | Also lets Fly validate the certificate.                                                |
| CNAME | `www`                 | `[CNAME target from fly certs setup www.eartheye.us, e.g. <app>.fly.dev]` | 1 hour |                                                                                        |
| CNAME | `_acme-challenge`     | `[target from fly certs setup eartheye.us]`                               | 1 hour | Only if Fly asks for DNS-01 (e.g. to issue before switching traffic).                  |
| CNAME | `_acme-challenge.www` | `[target from fly certs setup www.eartheye.us]`                           | 1 hour | Same, for www.                                                                         |
| TXT   | `_fly-ownership`      | `[value from fly certs setup]`                                            | 1 hour | Only if Fly asks (e.g. when a proxy/CDN sits in front).                                |

If the domain has CAA records, one must allow `letsencrypt.org`.

Cloudflare Access note: Access only works for hostnames proxied by Cloudflare,
which means moving eartheye.us nameservers from GoDaddy to Cloudflare (free
plan). Then use SSL mode "Full (strict)", verify the Fly cert with the
`_fly-ownership` TXT record, set `ALLOWED_HOSTS`, and optionally add a Transform
Rule that sets a secret request header matched by `ORIGIN_AUTH_HEADER` /
`ORIGIN_AUTH_SECRET`. Without Cloudflare, use the sign-in page (`LOGIN_USER` /
`LOGIN_PASS` / `SESSION_SECRET`).

## Rollback and stopping spend

```bash
fly releases --image                # list releases with their image refs
fly deploy --image registry.fly.io/<app>:deployment-<previous-id>   # redeploy an older image
fly logs                            # check the rollback
fly scale count 0 --yes             # stop compute entirely (rootfs/IP/cert charges only)
fly apps destroy <app>              # removes everything the app bills for
```

## Spend-cap notes

- **Fly.io has no hard spend cap and no billing alerts** ("We don't support
  billing alerts (yet)"). The cap is the configuration: one machine
  (`--ha=false`, `fly scale count 1`), `shared-cpu-1x` 512 MB, no volumes,
  shared IPv4 only. Worst case for compute is the always-on price. Check the
  dashboard's month-to-date bill.
- Outbound data is billed ($0.02/GB in North America). Map tiles and USGS load
  directly from their providers in the browser; the app's own JS/assets, API
  JSON and proxied CCTV images count.
- **Google**: in Cloud Console set per-API quotas (requests/day) on Places API
  (New), Street View Static and Map Tiles, plus a budget alert. Keep the browser
  key referrer-restricted and the server key API-restricted.
- **OpenAI**: set a project monthly budget / usage limit in the OpenAI
  dashboard; keep `RATE_LIMIT_METERED_PER_MIN` (20/min/IP) and consider
  `GEV_RATELIMIT_OPENAI_PER_MIN`.
- Free-tier upstreams (TomTom, FIRMS, OpenSky, LL2) throttle rather than bill,
  but note the provider disk caches in `.gev-cache/` (including TomTom's daily
  budget counter) live on the machine's ephemeral rootfs and reset on every
  restart or auto-stop, because there is no volume.
