import { initFirstRunExperience } from '../firstRunExperience.js';
import {
  dismissLoadingScreen,
  installLoadingCoverGuard,
} from './graphicsRecovery.js';

/** Max time the startup cover may block the globe before fail-open dismiss. */
export const LOADING_COVER_FAIL_OPEN_MS = 8000;

/** Reveal welcome controls only after restoration and the loading transition. */
export function startApplicationChrome({
  loadingScreen,
  styleManager,
  dataManager,
  signal,
  initializeWelcome = initFirstRunExperience,
  initializeSettings,
}) {
  let disposed = false;
  let firstRun;
  let revealTimer;
  let resolveDelay;
  let failOpenTimer;
  const minimumDelay = new Promise((resolve) => {
    resolveDelay = resolve;
  });
  const delayTimer = setTimeout(resolveDelay, 1000);
  const revealFirstRun = () => {
    if (disposed || signal.aborted || firstRun) return;
    firstRun = initializeWelcome?.({ styleManager, dataManager });
    clearTimeout(revealTimer);
    try {
      loadingScreen.removeEventListener('transitionend', revealFirstRun);
    } catch {
      /* cover may already be detached */
    }
  };
  const failOpen = new Promise((resolve) => {
    failOpenTimer = setTimeout(resolve, LOADING_COVER_FAIL_OPEN_MS);
  });
  // Never leave an interactive full-bleed loader if share restore hangs —
  // race restore+minimumDelay against a bounded fail-open.
  void Promise.race([
    Promise.all([styleManager.initialRestorePromise, minimumDelay]),
    failOpen,
  ])
    .catch(() => {
      /* Restoration reports its own outcome through the controls. */
    })
    .then(() => {
      if (disposed || signal.aborted) return;
      clearTimeout(failOpenTimer);
      dismissLoadingScreen(loadingScreen);
      installLoadingCoverGuard({ signal });
      try {
        globalThis.window?.dispatchEvent?.(
          new CustomEvent('ee:globe-gestures-restore'),
        );
      } catch {
        /* */
      }
      // Cover is removed sync; reveal welcome on a short timer (no transition wait).
      revealTimer = setTimeout(revealFirstRun, 200);
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
    clearTimeout(failOpenTimer);
    resolveDelay();
    try {
      loadingScreen.removeEventListener('transitionend', revealFirstRun);
    } catch {
      /* */
    }
    firstRun?.destroy();
    (await keySetup.catch(() => null))?.destroy();
  };
}
