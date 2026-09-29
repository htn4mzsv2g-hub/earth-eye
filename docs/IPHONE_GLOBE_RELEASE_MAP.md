# iPhone globe — release map

Ticket stays **open** until a physical iPhone can drag, pinch, and navigate. Unit tests and desktop Chrome are not that pass.

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

No document records a signed physical drag-and-pinch pass. The last owner note that the hosted globe still moved is Stage 2: it felt laggy and less immersive than God’s Eye View on a physical iPhone (`docs/STAGE2_REPORT.md`). That era’s rollback image is Fly v7 `registry.fly.io/eartheye:deployment-01M3NP74GRYB7T6M59TY3R9PA2`. Stage 1 (v7) did not use a physical iPhone. Non-3D graphics recovery starts at Fly v55; the image before that is v54 `registry.fly.io/eartheye:deployment-01M3PEW4KQQ6ZC1V00HM0C2C8J`. **v57 is after the non-3D audit. It is not a known-good globe.** Do not roll back to v62.

## This fix is not a deploy

Source for the loader cap, input trace, and gesture recording is on the restore branch. It is not deployed. Deploy only after this note is the one being shipped. Success is still a physical drag and pinch.
