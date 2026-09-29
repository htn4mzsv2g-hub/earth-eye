# Milestone — iPhone lag / Stage 5 polish wave 4 + matrix QA

Date: 2026-09-29 ~3:35 AM CT (America/Chicago)
Label: **unit + code fixes; not physical iPhone FPS claims**

## 1. Users can do
- On compact devices: globe also raises **maximumScreenSpaceError (≥4)** and caps **tileCacheSize (≤64)** after viewer create.
- When the tab is **hidden**, Atlas stops walking all layers for source-status / Data Sources patch ticks (resumes on visible).
- Engineers can re-run `node scripts/qa-stage5-matrix.mjs` for an honest Stage 5 unit matrix report.

## 2. Fixed / shipped
1. `applyMobileGpuTuning` — fewer terrain/imagery tiles on phone (fill-rate root cause).
2. Hidden-tab skip for `reportSources` + feeds health timer (main-thread vs resume).
3. Matrix QA script + `docs/STAGE5_MATRIX_QA.md` / `.json` (52 pass / 0 fail this run).

## 3. Providers verified
- None new. Mapbox not wired. Broadcastify HELD. LiveATC blocked. No TomTom key invented.

## 4. Tests
- Matrix: policy, mobile-perf, history, NAV-2, owner-hardening, data-sources-patch — **52 pass / 0 fail**.

## 5. Perf
- Lower tile density on phone SSError; less background JS while Safari is suspended. Emulation/unit only.

## 6. Limits
- Physical iPhone checklist still open. No push. Option C unchanged. No new spend.

## 7. Next
- Owner device re-check after deploy; TomTom key install remains separate.

## 8. SHA / release / rollback
- Branch: `stage5-incident-workspaces`
- SHA: `4561fb9`
- Release: **Fly v27** live — image `registry.fly.io/eartheye:deployment-01M3P3RRB0N4GNE1HYMGEMWSXR` (~3:30 AM CT). healthz 200; signup 403. Matrix QA 52/0. Option C unchanged. No push. No TomTom key invented.
- Rollback: Fly v26 `registry.fly.io/eartheye:deployment-01M3P3KHJ3M3TR1PB47JQ0ZENB`
