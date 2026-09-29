# Milestone — iPhone lag root-cause perf (wave 3) + SDR trim

Date: 2026-09-29 ~3:30 AM CT (America/Chicago)
Label: **emulation-oriented code fixes**; physical iPhone checklist still open.

## 1. Users can do
- On phones (coarse pointer / narrow width): globe boots with **MSAA 1×**, **30 FPS** target, and **DPR-clamped resolutionScale** instead of desktop 4×/60.
- Overlay open/close height sync coalesces to **one rAF** (less main-thread fight with Cesium).
- RTL-SDR USB stack (`@jtarrio/webrtlsdr`) loads **only on Connect**, not on every cold start (desktop Chrome WebUSB path; iOS never had WebUSB).

## 2. Fixed / shipped (root causes, not cosmetics)
1. Desktop GPU defaults on phone → thermal/jank (`mobileGpuProfile` + `createApplicationViewer`).
2. Mutation/Resize height sync storms → coalesced `scheduleHeights`.
3. Eager webrtlsdr in main graph via `SdrController` → dynamic import on connect.

## 3. Providers verified
- None new. No TomTom key. Mapbox not wired. Broadcastify HELD. LiveATC blocked.

## 4. Tests
- `mobileGpuProfile.test.mjs` + `application.test.mjs` + `controller.test.mjs` (45) and regression suite below.

## 5. Perf
- Phone: fewer MSAA samples, half the frame budget target, lower backing-store scale on high-DPR.
- Cold path: no webrtlsdr parse until SDR Connect.
- Still **not** a physical-iPhone measurement — `docs/IPHONE_CHECKLIST.md` remains owner.

## 6. Limits
- Physical iPhone lag vs GEV still open until owner re-checks. Option C unchanged. No push. No new spend.

## 7. Next
- Owner TomTom key install (separate). Re-run physical checklist after this deploy.
- Further matrix QA / dependency trim if SDR worker still pulls signals early.

## 8. SHA / release / rollback
- Branch: `stage5-incident-workspaces`
- SHA: `ce61958`
- Release: **Fly v26** live — image `registry.fly.io/eartheye:deployment-01M3P3KHJ3M3TR1PB47JQ0ZENB` (~3:25 AM CT). healthz 200; `/` 401; signup 403. Option C unchanged. No push. No TomTom key invented.
- Rollback: Fly v25 `registry.fly.io/eartheye:deployment-01M3P3E6VJDYQJF017QPQWGGDA`
