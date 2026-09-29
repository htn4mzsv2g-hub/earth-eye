# Stage 1 report: mobile, registry, cameras, Analyst tools

Date: 2026-09-28 (all times CT). Branch `stage1-mobile-registry`, merged to
`main` by fast-forward. Nothing pushed. Preview: **https://eartheye.us**
(sign-in required; registration closed).

**No physical iPhone was used.** Everything below ran in emulation: Playwright
WebKit (WebKitGTK with iPhone descriptors) and Google Chrome with iPhone
emulation and real CDP touch events. Please run `docs/IPHONE_CHECKLIST.md` (10
steps) on a real iPhone.

## Feature matrix

Legend: **V** = implemented and verified by an automated check; **I** =
implemented, verified only partly (see note); **U** = unavailable or held on
purpose.

| Area | Item | State | Evidence / note |
| ---- | ---- | ----- | --------------- |
| Tabs | Explore, Layers, Cameras, Analyst, More | V | qa-touch, qa-mobile, qa-iphone |
| Sheets | Every panel scrolls to its last item; the nav never covers it | V | Chromium: real CDP touch swipes to the end; WebKit: hit-test, touch-action, cancelable touch events, geometry |
| Sheets | Nothing sits above the scroll origin | V | New check; found and fixed VISUAL/LOCATION trays that were unreachable |
| Sheets | Content drags scroll; only the handle closes | V | Both engines, every sheet |
| Sheets | Scroll memory per tab | V | Both engines |
| Sheets | No duplicate headers | V | Both engines |
| Sheets | Keyboard (short viewport), rotation, 375 px | V | Both engines |
| Sheets | 200% text (Dynamic Type emulation) | V | No sideways overflow, 44 px close, tabs on screen, last item above the nav |
| Globe | Pans after every panel close and after camera errors (OFFLINE, EXPIRED) | V | Chromium touch drag; WebKit mouse drag |
| Cameras | Map tap and list open the same stable camera id | V | Both engines |
| Cameras | Still: displays, observation time, unchanged frame keeps old time and is marked STALE, last good frame kept on failure | V | Both engines |
| Cameras | Clip: inline, Play button, preload none, stops on close | V | Both engines |
| Cameras | Live: muted inline autoplay, Play button when play() rejects (simulated NotAllowedError), stops on close, EXPIRED | I | Verified only with a synthetic ffmpeg HLS stream injected by the test (labelled `[test fixture]`), because no live source is enabled. Chromium used native HLS, WebKitGTK used hls.js. iPhone Safari's native HLS has not been exercised with a real stream. |
| Cameras | Errors: OFFLINE, EXPIRED, UNSUPPORTED, UNAVAILABLE, never a fake frame | V | Both engines. Fixed: native HLS and MP4 report HTTP failures as code 4, so the status is now checked first |
| Cameras | Retry, source link | V | Both engines |
| Cameras | Fullscreen | I | Chromium: enters fullscreen. Headless WebKit has no Fullscreen API (noted). The iPhone path uses `webkitEnterFullscreen` (checklist step 6). |
| Cameras | Never preload a live stream while browsing | V | Request log check |
| Cameras | Live sources | U | DelDOT and Maryland CHART held "pending review" (no written embed permission). The live server offers 0 live cameras. |
| Registry | Provider, status, last success, cadence, coverage, limitation; delivery separate from freshness; observed separate from retrieved; permission line; unclear sources disabled | V | Unit tests plus the Data Sources screen in both engines |
| Analyst | Queries: resolve_place, query_entities, locate_cameras, source_health. Actions: fly_to, select_entity, set_layer. Validated schemas, limits (25), timeouts (8 s), citations | V | 11 unit tests plus qa-touch Analyst checks (both engines, local and live) |
| Analyst | "AI summaries are off"; unknown input says so (nothing invented) | V | Both engines |
| Access | Registration closed (`POST /signup` → 403); sign-in works; no WWW-Authenticate | V | curl, qa-login live |
| Out of scope | Radio; Stage 2+ | U | Not started |

## Root causes fixed (not symptoms)

1. Panels stopped short on iPhone because the Data Sources panel repainted
   every 5 s during a gesture, which kills iOS momentum scrolling. Repaints now
   wait until the touch ends plus 2.5 s.
2. The whole sheet header captured drags. Only the handle closes a sheet now.
3. Map taps weren't seen in WebKit (only pointerup was watched). Taps are now
   detected on pointerup, touchend and click.
4. The globe stayed blocked after some close paths because the overlay flag
   was only re-synced on some of them. A MutationObserver now re-syncs it on
   every close and error path.
5. Duplicate headers: upstream panel headers are hidden inside sheets.
6. VISUAL and LOCATION sheets: desktop pop-up trays sat above the scroll
   origin and couldn't be reached. They are in-flow in sheets now, and the pin
   button is hidden.
7. Native HLS/MP4 errors: an expired lease read UNSUPPORTED. The HTTP status
   is checked first now, and play() rejection shares the same classifier.
8. Focused filter chips could hide under the sticky search bar. Added
   scroll-padding-top.

## Commands and results (final build)

Local production server `node server/prod.mjs` on 127.0.0.1:4173 (no login).
Live runs use `BASE=https://eartheye.us` with the login read in-process from
the box secrets file into `QA_LOGIN_USER`/`QA_LOGIN_PASS` (never printed).

### WebKit (Playwright WebKitGTK, iPhone 13 / 14 Pro Max / SE)

| Command | Target | Result |
| ------- | ------ | ------ |
| `ENGINES=webkit node scripts/qa-touch.mjs` | local final build (2324dca) | **346 passed, 0 failed**, 13 notes (sheets that fit without scrolling; headless WebKit has no Fullscreen API) |
| `BASE=https://eartheye.us ENGINES=webkit node scripts/qa-touch.mjs` (login in-process) | live v7 | **349 passed, 0 failed**, 13 notes (same) |
| `… ENGINES=webkit VPS=iphone13-390 PARTS=map` | live v7 and local | PASS, real cameras: `ca-d11-x1241` (live), `tfl-00001.06502` (local) |

WebKit can't synthesize touch-move, so WebKit scrolling is proven through its
preconditions: hit-testing, effective touch-action, touch events not
cancelled, overflow, and geometry at the end. Taps are real touch taps.

### Chromium (Google Chrome, iPhone emulation, CDP touch)

| Command | Target | Result |
| ------- | ------ | ------ |
| `ENGINES=chromium node scripts/qa-touch.mjs` | local final build (2324dca) | **314 passed, 0 failed**, 12 notes (sheets that fit without scrolling) |
| `BASE=https://eartheye.us ENGINES=chromium PARTS=cameras,map,analyst node scripts/qa-touch.mjs` | live v7 | **36 passed, 0 failed** |
| `… ENGINES=chromium VPS=iphone13-390 PARTS=map` | live v7 and local | PASS, real cameras: `ca-d11-x1241` (live), `tfl-00001.06502` (local) |
| `node scripts/qa-mobile.mjs` (puppeteer, Chrome) | local (eb89896) | 0 failures, 0 page errors |
| `node scripts/qa-iphone.mjs` (puppeteer, Chrome, CDP touch) | local (eb89896) | 390 and 430: pass. 375: pass when run alone. In the 3-viewport run, Chrome's renderer ran out of resources at 375 ("Target closed"). That is harness resource exhaustion on the shared box, not a page error. |
| `npm run test:track` (Vite dev server on :4173) | local | **109 passed, 0 failed** |

Map selection is a real touch tap on the globe canvas, followed by the layer's
own pick path (`setActiveCamera`). A tap on the exact billboard pixel isn't
automated.

### Other

| Command | Result |
| ------- | ------ |
| `npm test` | **5206 tests: 5205 pass, 0 fail, 1 skipped** (upstream skip) |
| `npm run format:check` | OK (1117 files) |
| `npm run check:boundaries` | OK |
| `node scripts/qa-login.mjs --url https://eartheye.us` (login in-process) | 9/9 steps, 0 failures (sign-in, signup closed, wrong credentials, terms, privacy, signed in, log-out button, logged out) |
| curl on v7 | `/healthz` 200 (both hosts); browser `/` → 302 `/login`; non-browser `/`, `/api/cctv/sources` → 401 JSON; `POST /signup` → 403; `eartheye.fly.dev` → 308; `WWW-Authenticate` count 0 on `/`, `/login`, `/api/cctv/sources`, `/signup`, `/healthz` |
| `fly machines list` / `ips list` / `volumes list` | 1 machine (`83695dc7759698`, check 1/1), shared IPv4 only, no volumes |

**Live-stream test fixture:** no live source is enabled, so `qa-touch` injects
one camera named "QA TEST FIXTURE (synthetic test pattern, not a camera)"
into the test browser only (Playwright request routing). Its stream is a local
ffmpeg test pattern. Results that used it are labelled `[test fixture]`.
Nothing is added to the app or the server.

Reports: `screenshots/mobile-v2/touch/report-*.json`, logs in
`screenshots/mobile-v2/touch/logs/`, screenshots in
`screenshots/mobile-v2/touch/` and `screenshots/mobile-v2/` (gitignored, on
the build box only).

## Rollback

- **Stage 1 rollback point:** Fly **v5**, image
  `registry.fly.io/eartheye:deployment-01M3N3D0GYAV8S5T9R50VHWG98` (the working
  tree committed as `837e907`). Previous `main` was `1e5aeae`.
- Current: Fly **v7**, image
  `registry.fly.io/eartheye:deployment-01M3NP74GRYB7T6M59TY3R9PA2`, commit
  `2324dca` (`main` and `stage1-mobile-registry`). v6 (`eb89896`) was an
  intermediate Stage 1 deploy.

```bash
env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3N3D0GYAV8S5T9R50VHWG98
# source: git checkout 837e907   (or: git branch -f main 1e5aeae for the pre-Stage-1 main)
```

## Not done in Stage 1

- No physical-device test.
- No live video source (held on purpose).
- Stage 2 not started. Requirements in
  `/workspace/earth-eye-spec/STAGE2-5_CORRECTIONS_2026-09-28.md` were read for
  awareness only.
- `docs/UPSTREAM_PARITY.md` is a verbatim copy of
  `/workspace/earth-eye-spec/parity/PARITY_MATRIX.md`, kept as is.
