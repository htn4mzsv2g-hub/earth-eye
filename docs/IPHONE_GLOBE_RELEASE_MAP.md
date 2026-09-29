# iPhone globe — release map

**Known-good rollback is Fly v66** (`b846a3e`, BUILD_ID `git-b846a3e-202609290929`). Owner Ruben confirmed physical iPhone drag and pinch on 2026-09-29 ~9:34 AM CT. Canonical record and the `fly deploy --image` command: [`ROLLOUT_KNOWN_GOOD.md`](ROLLOUT_KNOWN_GOOD.md). Tag `known-good/iphone-globe-v66-b846a3e`. Do not redeploy this image to record it. Unit tests and desktop Chrome are not a substitute for that pass.

## What v64 showed

Fly **v64** image `registry.fly.io/eartheye:deployment-01M3PP94CEW9K7HV9KSYRVVT3F`, BUILD MATCH `git-825a59d-202609291339`.

Owner paste (authoritative; not a stale cache):

- Center hit: `div.loader-content`
- `#loading-screen`: pointer-events `auto`, visibility `visible`, display `flex`, opacity `1`, z-index `1000`
- Camera `inputs=false`
- Render loop `true`, `requestRenderMode=false`, WebGL lost `false`
- `GESTURE none`, with events aimed at the DIAG button because DIAG was open

Those computed styles are the loader’s **initial** rule in `src/ui/styles/controls.css`, not a half-dismissed `.hidden` transition. `releaseLoadingScreen` had not taken effect on the live node. Nothing in this tree removes `.hidden` or rebuilds `#loading-screen` after release. The release call itself was skipped.

## Why the loader stayed up

`startApplicationChrome` (`src/app/startupChrome.js`) called `releaseLoadingScreen` only after `styleManager.initialRestorePromise` and a 1s delay. That promise is `ShareRestoration.initialRestorePromise`. With a share hash (the app writes one after the first camera move; a reload keeps it), settlement waits on `ShareLinkManager.applyState`, which waits on `camera.flyTo` `complete` or `cancel`. If neither callback runs, the promise stays pending and the loader stays at display `flex` / opacity `1`.

The fix releases the live `#loading-screen` on a 1200ms cap even when that promise never settles. Welcome UI still waits for restoration. Share restore itself is capped at 8s so the promise cannot wedge the session. Release stamps `data-ee-loader-released` and `data-ee-loader-released-at` and records `__eeLoaderRelease` (time, reason, connected). If that stamp is present and the node still intercepts — styles cleared, class removed, or the hide ignored — the node is replaced with an empty inert stand-in. `pageshow`, `visibilitychange`, and `focus` re-run that check. Opening DIAG also releases a loader that is still up, and the panel prints `LOADER AT OPEN` from before that release, including the stamp time.

## Why `inputs=false`

DIAG does not write `screenSpaceCameraController.enableInputs`. The writers that set it `false` are:

- `src/ui/cockpitTrackingController.js` — cockpit enter; exit sets `true`. Left false while `body` has `cockpit-mode`.
- `src/data/cctvGizmo.js` — gizmo drag; pointer-up sets `true`.
- `src/ui/imageryBoxTool.js` — imagery box drag; pointer-up restores the previous value.
- `src/data/localGeojsonCore.js` — entity flyTo. `complete` / `cancel` set `true`. A flight that never ticks used to leave inputs false. A 2.5s timer now releases them.

`installCameraInputTrace` wraps the Cesium setter and keeps the last disable stack plus the module name when it is one of those four files. DIAG prints `INPUT DISABLE module=…`. Closing DIAG forces `enableInputs`, `enableRotate`, `enableZoom`, and `enableTilt` back to `true` unless `body` has `cockpit-mode` or a gizmo / imagery-box drag still holds `__eeCameraInputHold`. The panel keeps `AFTER DIAG CLOSE` with the four flags before and after. The same input restore runs when the loader is released and again at 3s and 8s. It does not run on a timer after that, so a later drag tool can still freeze the camera while it is dragging.

## Gesture classes

`classifyAttempt` in `src/app/globeGestureTrace.js`:

| Code | Meaning |
| --- | --- |
| A | Document-level pointer or touch was recorded and none of those events reached the Cesium canvas (loader, DIAG, or another overlay). |
| B | An event reached the canvas and the camera did not move. |
| C | The camera moved and the frame number did not advance. |
| D | WebGL context lost, the render loop was stopped while the page was visible, or a render error was recorded. |
| pass | The gesture reached the canvas, the camera moved, and a frame rendered. |
| none | The event ring is empty. This is not a verdict that the user did not try. |

Capture is on `document` in the capture phase (`pointer*` and `touch*`), not only on the canvas. A loader hit is class A. iOS delivers both pointer and touch for one finger; the monitor no longer waits on the extra touch id, which used to leave `lastGesture` unset while the ring filled. If events exist and `lastGesture` is still unset, the panel classifies the ring instead of printing `GESTURE none`. DIAG-button events are ignored when any other target (the loader, the canvas) is in the ring. Opening DIAG does not clear the stored attempt. Closing DIAG stores the input flags from before and after the restore.

Lines to paste if another read is needed: `BUILD`, `META`, `LOADER AT OPEN`, `LOADER`, `GESTURE`, `INPUT DISABLE`, `AFTER DIAG CLOSE`, `FLAGS`, `HIT STACK now`.

## Last known movement

The signed physical drag-and-pinch pass is **Fly v66** (see below and [`ROLLOUT_KNOWN_GOOD.md`](ROLLOUT_KNOWN_GOOD.md)). Earlier, Stage 2 still moved on a physical iPhone and felt laggy and less immersive than God’s Eye View (`docs/STAGE2_REPORT.md`). That era’s image is Fly v7 `registry.fly.io/eartheye:deployment-01M3NP74GRYB7T6M59TY3R9PA2`. Stage 1 (v7) did not use a physical iPhone. Non-3D graphics recovery starts at Fly v55; the image before that is v54 `registry.fly.io/eartheye:deployment-01M3PEW4KQQ6ZC1V00HM0C2C8J`. **v57 is after the non-3D audit. It is not a known-good globe.** Do not roll back to v62, v64, or v65.

## v65: loader is gone; the detection surface took the touch

Fly **v65** BUILD MATCH `git-3831c06-202609290905`. `LOADER` is `class=hidden`, `display=none`, `released=1`, `connected=yes`. That path is closed.

The center hit was `canvas#world-overlay-detection-surface` (`pe=auto`, `z=5`) over `#cesiumContainer`. Gesture class A: the touch never reached the Cesium canvas. Compact mobile CSS restores gestures with `html.ee-compact:not([data-ee-overlay]) #cesiumContainer canvas { pointer-events: auto !important }`. The detection blend canvas is parented inside `#cesiumContainer`, so that rule made the full-bleed paint surface the hit target. The surface stays `pointer-events: none` (stylesheet exception plus inline `!important`). It is a blend layer, not an input layer. Scope mask, celestial ring, and wind canvases in the same container are exempt the same way. A free-nav `pointerdown` / `touchstart` turns camera inputs back on unless cockpit or an active gizmo/imagery drag owns them.

## v66: known-good (physical drag and pinch)

Owner Ruben confirmed this release on a physical iPhone on **2026-09-29 ~9:34 AM CT**. Same block as `docs/ROLLOUT_KNOWN_GOOD.md`, `HANDOFF.md`, `DEPLOY_FLY.md`, and PR #3.

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

| Item | Value |
| --- | --- |
| Fly release | **v66** |
| Image | `registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z` |
| Digest | `sha256:b0ce45ef7a4386b850238fbc8161c3618bb8822891cf363d70c5ee7987618824` |
| BUILD_ID | `git-b846a3e-202609290929` |
| SHA | `b846a3e0557bc879142aef69c2babd812757a9fc` |
| Branch | `cursor/restore-preaudit-globe-444e` |
| Tag | `known-good/iphone-globe-v66-b846a3e` |

Rollback command (same as the block; do not run unless a later deploy is bad): `fly deploy -a eartheye --ha=false --image registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z`

Full record: [`ROLLOUT_KNOWN_GOOD.md`](ROLLOUT_KNOWN_GOOD.md).

## This fix shipped as v66

The loader cap, input trace, gesture recording, and detection-surface `pointer-events: none` are what Fly **v66** is running. That image is the rollback point. Do not redeploy it to record the pass.
