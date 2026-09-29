# P0 — iPhone globe freeze / no-drag regression

**Status: OPEN** (still frozen after Fly **v62**; v63 past-loader slice shipped — do NOT claim fixed without owner physical iPhone confirm)
**Recorded:** ~7:06 AM America/Chicago (CT) 2026-09-29  
**Updated:** 2026-09-29 ~8:10 AM CT (Fly **v63** `git-e91d7a6-202609291301` — interact hold + touch-action + render-loop guard + HTML no-store — P0 still OPEN)
**Reporter:** owner Ruben on **physical iPhone** (not emulation)  
**Production tip at report:** Fly **v58** → **v59** → **v60** → **v61** → next tip after this slice  
**Work branch:** `fix/audit10-workflow`

## Symptom

On a real iPhone, the globe appears like a **still image** and **does not respond to dragging** (no pan/rotate). Owner expects normal touch navigation when 3D is up.

## Owner DIAG history

### Fly v60 (`git-ebafb9a-202609291225`)
- overlay none, pointer-events auto, enableInputs all true, webgl ok, cockpit/tracked false, orphan sheet-host none
- **TOP @ CENTER: `div.loader-content`** (child of `#loading-screen`)
- Globe STILL will not move

### Fly v61 (`git-2e78917-202609291238`)
- Owner confirmed **STILL FROZEN** (may or may not have verified DIAG build line — treat as fix failed or incomplete)
- Ticket stays OPEN


## Post-v62 slice (past loader)

Treat loader as possibly fixed OR incomplete. Additional closed modes:
1. **C1** `requestRenderMode` idle during drag → `holdContinuousRender('camera-interact')` on pointer/touch down.
2. **D1** `touch-action: none` on `#cesiumContainer` + canvas (iOS must not steal pan).
3. **C2** `installRenderLoopGuard` restores `useDefaultRenderLoop` if left false while visible.
4. **F1** `ensureGlobeInteractive()` after startup dismiss + `ee:globe-gestures-restore`.
5. **E1** HTML/`/` `Cache-Control: no-store` + `<meta name="ee-build-id">`.

## Root cause (Hypothesis H2 — PRIMARY after v61)

`#loading-screen` is a full-bleed `z-index: 1000` cover. Owner evidence on v60: top hit = `div.loader-content` while input flags looked fine.

v61 dismissed with `.hidden` + pe:none + **deferred** DOM remove (transitionend / 1s). That left a window (and BFCache/pageshow path) where the cover could remain hit-testable. Opacity:0 alone is insufficient.

**H2 fix:**
1. `#loading-screen` / `.loader-content` default **`pointer-events: none !important`** (cover has no controls — never needs hits).
2. `dismissLoadingScreen` **removes synchronously** (no transition wait) + `purgeLoadingCover` by id.
3. `installLoadingCoverGuard` re-purges on `pageshow` / visibility + late timers.
4. DIAG Restore also purges any leftover cover.
5. DIAG v2: multi-point hits, loader-content count, pe:auto over canvas, camera nudge, build id.

## Hypotheses

| ID | Hypothesis | Status |
| --- | --- | --- |
| **A** | Sticky `sessionStorage ee:force-non3d` | Mitigated v59 — insufficient |
| **B** | Sticky `html[data-ee-overlay]` → canvas pointer-events none | Mitigated v60 — owner DIAG overlay=none |
| **C** | `enableInputs` left false | Owner DIAG: all true |
| **D** | WebGL / render stalled | Owner DIAG: webgl ok; DIAG v2 adds camera nudge |
| **E** | Orphan `.ee-sheet-host` | Owner DIAG: none |
| **F** | Sheet peek/half full-bleed | Mitigated v60 |
| **G** | Follow / cockpit holding inputs | Owner DIAG: false |
| **H** | `#loading-screen` / `.loader-content` interactive hit target | **PRIMARY** — owner TOP @ CENTER = loader-content |
| **H2** | Deferred remove / pe default / BFCache left cover interactive after v61 | **THIS SLICE** |

## Fix slice (post-v61)

1. CSS: `#loading-screen` and `.loader-content` always `pointer-events: none !important`.
2. `dismissLoadingScreen`: sync remove + `purgeLoadingCover(doc)`.
3. `installLoadingCoverGuard`: pageshow / visibility / late purge.
4. DIAG v2 lines for next owner paste (build, loader DOM/count, top@25/50/75, pe:auto over canvas, camera nudge, enable*, requestRenderMode).
5. Wording unchanged: **"input flags enabled — gesture response unverified"**.
6. Tests: sync dismiss, purge by id, guard pageshow, DIAG fields, startupChrome fail-open.

## Owner verify (physical iPhone) — required to CLOSE

1. Hard-refresh https://eartheye.us (no `ee_non3d`). Confirm **build** starts with new tip SHA (not `git-2e78917-…`).
2. Open **MORE → DIAG** (or `?ee_diag=1`).
3. Paste these lines: **build**, **git**, **loading-screen in DOM**, **.loader-content count**, **top @ 50/25**, **top @ 50/50**, **top @ 50/75**, **pe:auto over canvas**, **camera nudge**, **enableInputs**, **requestRenderMode**.
4. Tap **Close**. Re-open DIAG — **post-close hit** must be **canvas** (not loader-content). Expect **camera nudge = camera-moves**.
5. Drag / pinch / rotate — globe must move.
6. Optional: GLOBE sheet open→close; background Safari and return — drag returns.
7. Ticket stays **OPEN** until owner confirms steps 4–5 on physical iPhone.

## Not verified on real device (this agent)

Physical iPhone drag was **not** verified by the agent. Ticket stays **OPEN**.


## Deploy (v63)

| Item | Value |
| --- | --- |
| Prior tip (rollback) | **v62** `registry.fly.io/eartheye:deployment-01M3PK9YBSRTQ828KZBFRZFV20` |
| New tip | **v63** |
| New image | `registry.fly.io/eartheye:deployment-01M3PM3SACNVA31WR535SNPGR3` |
| Build id | `git-e91d7a6-202609291301` |
| Commit | `e91d7a6` on `fix/audit10-workflow` |
| Status | **OPEN** — not verified on physical iPhone |
| healthz | 200 |


## Test commands

```bash
node --test \
  src/app/eeDiagnostics.test.mjs \
  src/standalone/startupChrome.test.mjs \
  src/app/graphicsRecovery.test.mjs \
  src/firstRunExperience.test.mjs \
  src/atlas/mobileOverlayRestore.test.mjs \
  src/atlas/ux4.test.mjs \
  src/atlas/mobileLayout.test.mjs
```
