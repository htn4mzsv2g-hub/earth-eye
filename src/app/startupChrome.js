import { initFirstRunExperience } from '../firstRunExperience.js';
import { restoreCameraInputsUnlessCockpit } from './cameraInputTrace.js';
import { releaseLoadingScreen } from './loadingScreenRelease.js';

/**
 * Hit testing ends on this cap even when share restoration never settles.
 * Fly v64 left `#loading-screen` at its initial CSS (display:flex, opacity:1,
 * visibility:visible, pointer-events:auto). That is the unreleased node, not
 * a half-finished opacity transition. `startApplicationChrome` used to call
 * `releaseLoadingScreen` only from the `initialRestorePromise` completion,
 * and a share-link `camera.flyTo` whose complete/cancel callback never runs
 * leaves that promise pending forever.
 */
const LOADER_RELEASE_CAP_MS = 1200;

function liveLoadingScreen(preferred) {
  const doc = globalThis.document;
  const current = doc?.getElementById?.('loading-screen');
  if (current) return current;
  return preferred || null;
}

/** Reveal welcome controls only after restoration. The loader must not wait. */
export function startApplicationChrome({
  loadingScreen,
  styleManager,
  dataManager,
  signal,
  initializeWelcome = initFirstRunExperience,
  initializeSettings,
}) {
  let disposed = false;
  let released = false;
  let firstRun;
  let revealTimer;
  let resolveDelay;
  const minimumDelay = new Promise((resolve) => {
    resolveDelay = resolve;
  });
  const delayTimer = setTimeout(resolveDelay, 1000);
  const releaseCover = (reason) => {
    if (released || disposed) return;
    released = true;
    const live = liveLoadingScreen(loadingScreen);
    releaseLoadingScreen(live, { reason });
    restoreCameraInputsUnlessCockpit(
      styleManager?.viewer,
      globalThis.document,
      reason,
    );
  };
  let resolveCap;
  const releaseCap = new Promise((resolve) => {
    resolveCap = resolve;
  });
  const capTimer = setTimeout(resolveCap, LOADER_RELEASE_CAP_MS);
  void releaseCap.then(() => {
    releaseCover('cap');
  });
  const revealFirstRun = () => {
    if (disposed || signal.aborted || firstRun) return;
    firstRun = initializeWelcome?.({ styleManager, dataManager });
    clearTimeout(revealTimer);
    const live = liveLoadingScreen(loadingScreen);
    live?.removeEventListener?.('transitionend', revealFirstRun);
  };
  void Promise.all([styleManager.initialRestorePromise, minimumDelay])
    .catch(() => {
      /* Restoration reports its own outcome through the controls. */
    })
    .then(() => {
      if (disposed || signal.aborted) return;
      releaseCover('restore-settled');
      const live = liveLoadingScreen(loadingScreen);
      live?.addEventListener?.('transitionend', revealFirstRun, {
        once: true,
      });
      revealTimer = setTimeout(revealFirstRun, 900);
    });
  const keySetup = Promise.resolve(
    signal.aborted ? null : initializeSettings?.({ signal }),
  );
  // Own the pending initializer too; it must not reveal a dialog after abort.
  void keySetup.catch(() =>
    console.error('Provider settings initialization failed'),
  );
  return async () => {
    disposed = true;
    clearTimeout(delayTimer);
    clearTimeout(revealTimer);
    clearTimeout(capTimer);
    resolveDelay();
    resolveCap();
    const live = liveLoadingScreen(loadingScreen);
    live?.removeEventListener?.('transitionend', revealFirstRun);
    firstRun?.destroy();
    (await keySetup.catch(() => null))?.destroy();
  };
}
