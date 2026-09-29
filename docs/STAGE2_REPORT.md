# Stage 2 report — shared state, registry, provenance, health

Date: 2026-09-28 (America/Chicago). Branch: `stage2-registry-health` → merged to `main` locally (not pushed).

## Scope completed

1. **Excluded / fake features** — ALPR, simulated traffic (+ Director scenes), TR-3B, Shinjuku config, launch replay/reconstructed tracks, radio. Hidden from every user-facing control; enable gate refuses them; code only behind `VITE_EE_DEV_EXCLUDED=1` (off in production).
2. **Source health** — states online / degraded / offline / key required / rate limited / stale (+ off, connecting, disabled, static). Last success, last attempt, provider. Data Sources screen + layer-row chip. Dead providers never look idle.
3. **Registry licence boundaries** — permission review dates on every source; Bhote Koshi locator → CC BY-NC 4.0; cables → CC BY-NC-SA 3.0; fire packs + other NC flagged; `EE_COMMERCIAL_SAFE` single switch (off by default).
4. **Attribution & Licenses panel** — MORE → LICENSES; 9 model CC BY credits from `public/models/README.md`; every registry source.
5. **Military colour** — green from source `dbFlags` / feed listing, not hard-coded amber.
6. **User-Agent** — `private hosted instance; +https://eartheye.us`.
7. **Ontario 511** — KEY REQUIRED (never approved). Maryland CHART + DelDOT held.

## Process

BUILD → TEST → BREAK-TEST → FIX → RE-TEST → DOCUMENT for each item. Stage 1 touch suites re-run after.

## Not started

Stage 3+ (satellites rewrite, new CCTV packs, heights, routing, weather alerts).

## Performance (standing bar — real iPhone feedback)

Owner reports the hosted build still feels laggy / less immersive than God's Eye
View on a physical iPhone. Stage 2 starts measuring and fixing root causes
(not cosmetic patches):

| Wrong                                                            | Why                                                          | Fix                                                                                                 | Verified                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Data Sources full `innerHTML` rewrite every 5 s while open       | Tears down scroll position, kills iOS momentum, drops frames | `patchDataSourcesHealth` updates badges/timestamps in place; full render only on open/filter/toggle | unit `dataSourcesPatch.test.mjs`; journey `qa-journey-perf.mjs` (emulation) |
| Camera viewer HLS/video kept running after leaving Cameras sheet | Background media burns CPU/battery on phone                  | `closeViewer()` on panel close and when switching away from CCTV                                    | journey perf (emulation)                                                    |

Journey/perf script: `scripts/qa-journey-perf.mjs` (labelled **emulation, not
physical iPhone**). Budgets: panel open < 1.5 s, close < 0.8 s, heap Δ < 80 MiB,
network fan-out bounded, globe pans after every close.

Real-device checklist remains `docs/IPHONE_CHECKLIST.md` — automated pass alone
never claims complete.

## Product standard alignment (2026-09-29)

Applied `/workspace/earth-eye-spec/PRODUCT_STANDARD_2026-09-29.md` Stage 2 bar
without restarting the app:

- Registry: permissions split (display/embed/proxy/store/export/AI), review
  date + evidence, delivery type, freshness, cadence/cache notes, kill switches
  (excluded / blocked / commercial-safe / operator DISABLED), source-specific
  stale windows (`staleAfterMs`).
- Timing: observation ≠ publication ≠ retrieval on the status store and Data
  Sources rows; `normalizeRecord()` for provider-qualified IDs + record class
  (observed / reported / predicted / forecast / snapshot). No universal
  LIVE-under-30s rule.
- Health: online / degraded / offline / key required / rate limited / stale,
  plus genuinely empty (`online` + "no records") vs unavailable. Permission-held
  and key-required packs stay held.
- Lifecycle: non-removable enable policy; refresh epochs cancel obsolete work;
  late failures do not look like quiet "no activity".
- No H3/PostGIS. QA live HLS fixture stays Playwright-route-only (never in the
  production catalog). Shinjuku test config removed.
- Definition of done: journeys + real sources + permissions + honest timing +
  failure/recovery + shared state + measured perf + recorded tests + real-device
  gaps disclosed (physical iPhone checklist still open).

## Continuous monitoring (wake-time) + HARD SPEND GATE

Integrated `/workspace/earth-eye-spec/CONTINUOUS_MONITORING_2026-09-29.md`
**without claiming 24/7** and **without changing Fly auto-sleep**.

### What was built (works when the machine is awake)

- `server/collection/` — policies, in-memory store (idempotent upsert, out-of-order
  guard, retention), adapters (USGS live; NHC/FIRMS deferred stubs), bounded
  scheduler (concurrency 1, backoff, cancel on stop).
- `GET /api/atlas/collection-health` — last success/attempt, expected next check,
  failures, backlog, review queue. `continuousClaim: false` always.
- Analyst `source health` includes collection coverage + last success.
- New sources sit in `SOURCE_REVIEW_QUEUE` (not auto-collected). Paid AI stays off.
- No indiscriminate scrape; only reviewed adapters.

### Current Fly posture (inspected 2026-09-29 ~12:51 AM CT; re-checked ~1:00 AM CT)

| Setting                | Value                                     |
| ---------------------- | ----------------------------------------- |
| App                    | `eartheye` (dfw)                          |
| Machine                | `83695dc7759698` shared-cpu-1x **512 MB** |
| State at inspect       | **started** (HTTP-woke; will auto-stop again when idle) |
| `auto_stop_machines`   | `stop` / true                             |
| `auto_start_machines`  | true                                      |
| `min_machines_running` | **0**                                     |
| Volumes                | **none**                                  |

A sleeping machine cannot run collection. Schedules resume on the next HTTP wake
and stop again when Fly autosleeps — that is intentional until Ruben approves spend.

### Options BEFORE any spend increase (need Ruben's yes)

Pricing from [Fly.io Resource Pricing](https://docs.fly.io/about/pricing/)
(`shared` CPU \$0.00000075/vCPU-s, RAM \$0.00000193/GB-s; **dfw markup ×1.25**).

| Option                            | Change                                                   | Approx monthly (730 h)                                               | Effect                                                                                                                  |
| --------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **A. Keep auto-stop (current)**   | none                                                     | ~\$0 when idle; pay only while awake                                 | Collection only during visits / warm windows. **Not 24/7.** Recommended until approved.                                 |
| **B. Always-on, no volume**       | `min_machines_running = 1`, `auto_stop_machines = false` | ~**\$4.05/mo** for shared-1x @ 512 MB in dfw (CPU+extra 256 MB RAM)  | Schedules keep running; still **no durable history** across deploys/restarts beyond process life unless we add storage. |
| **C. Always-on + small volume**   | B + Fly volume (e.g. 1 GB)                               | B + volume (~\$0.15/GB-mo typical; confirm current Fly volume price) | Permitted state/history can survive sleep/restart.                                                                      |
| **D. Second machine / larger VM** | extra machines or more RAM/CPU                           | multiplies B                                                         | Not needed for Stage 2; reject for show.                                                                                |

**Stopped here on spend:** no fly.toml auto-stop change, no volume create, no
scale-up. Ingestion code is ready for option A today and for B/C when Ruben says yes.

## Milestone report (7-point) — 2026-09-29 ~1:10 AM CT

1. **What users can now do.** Open Data Sources and see honest health (online/degraded/offline/key required/rate limited/stale) with last success/attempt and separate observation/publication/retrieval clocks; toggle only permitted layers (ALPR/traffic/radio/TR-3B/launch-replay refused); open MORE → LICENSES for model + registry credits; ask Analyst "source health" and see wake-time server collection coverage (feeds, backlog, review queue) without any 24/7 claim; commercial-safe mode available via `EE_COMMERCIAL_SAFE=1` (off by default).

2. **Which real sources were verified.** USGS earthquakes via collection adapter (~214 records when awake); registry licence boundaries (Bhote Koshi CC BY-NC 4.0, cables CC BY-NC-SA 3.0); CCTV pack health including Ontario KEY REQUIRED and DelDOT held; military colour from source `dbFlags` (green). NHC/FIRMS collection adapters remain **deferred** (existing proxies still serve the map). Review queue holds ALERTCalifornia/HPWREN and NWS alerts — not auto-collected.

3. **What was fixed and why.** Excluded fiction enforced (not just labelled); dead providers no longer look idle; Data Sources 5 s timer no longer full-rebuilds DOM (iPhone jank root cause); camera viewer closes when leaving Cameras; UA describes private hosted instance; continuous monitoring integrated as **wake-time** server collection — Fly auto-stop left unchanged (spend gate).

4. **Performance measurements (emulation, not physical iPhone).** `qa-journey-perf` Chromium: panel open 161–489 ms (budget 1500); close 159–629 ms (budget 800); heap Δ ~9–16 MiB (budget <80); app/API fan-out 19 (budget <120) with map tiles counted separately (~580); Data Sources DOM node stable across 5 s timer. Physical iPhone checklist still open (`docs/IPHONE_CHECKLIST.md`).

5. **Remaining limitations and blocked dependencies.** Collection does **not** run while Fly machine sleeps (`auto_stop` + `min_machines_running=0`, no volume). Options A–D + ~$4.05/mo always-on estimate above — **need Ruben's yes before any spend change**. NHC/FIRMS adapters deferred; new camera packs Stage 4; satellites GP/OMM rewrite Stage 3/4; paid AI off; physical-iPhone lag feedback still standing.

6. **Commit, release and rollback references.** Branch `stage2-registry-health` @ `7e60722` → merged to `main` locally (not pushed). Fly image lineage includes v8+; **Option A restored** (auto-stop on, no volume) under spend HOLD. Rollback v7 `registry.fly.io/eartheye:deployment-01M3NP74GRYB7T6M59TY3R9PA2` remains.

7. **What is being built next.** Stage 3 connected Analyst (deterministic tools, map actions, coverage-aware answers) and early Stage 3/4 satellite honesty + routing no-fallback; camera packs and weather alerts remain Stage 4. Continuous collection stays wake-time until spend approval.

## Honesty vs PRODUCT_STANDARD (reconcile — 2026-09-29 CT)

Status against PRODUCT_STANDARD Stage 2 / continuous-monitoring bars. Do not
treat UI presence as complete.

| Requirement | Status | Notes |
| --- | --- | --- |
| Shared source registry + health + provenance clocks | **partial → largely done** | Registry, health states, normalizeRecord, Data Sources panel |
| Secure owner-only provider / credential config UI | **incomplete** | App is owner-login gated; there is no dedicated secure in-app credential vault/settings for provider keys beyond env secrets. Mark incomplete. |
| Credential testing (verify key works, fail honestly) | **incomplete** | Ontario KEY REQUIRED is labelled; no general “test credential” flow for owner-supplied keys. |
| Persistent collection state across restarts | **incomplete on Fly (Option A)** | Code supports durable checkpoints when `EE_COLLECTION_DATA_DIR` is set; **Fly has no volume** under spend HOLD. In-memory only while process awake. |
| Restart recovery / wake-safe schedules | **partial** | Scheduler starts on process boot; sleeps with auto-stop. Not 24/7. |
| Continuous claim / 24/7 | **not claimed** | `continuousClaim` false unless continuous env + writable durable dir (Option C, not approved). |
| Physical iPhone lag | **open** | Emulation journey budgets pass; owner reports laggy vs God’s Eye View. Checklist `docs/IPHONE_CHECKLIST.md`. |

### iPhone lag (standing — measurements)

| Probe | Result | Device |
| --- | --- | --- |
| `qa-journey-perf` Chromium | panel open 161–489 ms; close 159–629 ms; heap Δ ~9–16 MiB; 19 app/API + ~580 tiles | **emulation**, not physical iPhone |
| Owner feedback | still somewhat laggy / less immersive | **physical iPhone** — open |

Root causes fixed so far (emulation-verified): Data Sources 5 s full DOM rebuild; orphan CCTV media after leave. Remaining physical-device work still open.

### Spend — Option C KEEP (2026-09-29)

Ruben confirmed KEEP Option C + daily volume snapshots (5-day retention).
Live details: `docs/OPTION_C_FLY.md`. Est. ~$4.20/mo. No further Fly spend
changes without new approval.

Still incomplete vs product standard: owner credential config UI, credential
testing, physical iPhone lag. Persistent collection is now on the volume when
the always-on machine is healthy.
