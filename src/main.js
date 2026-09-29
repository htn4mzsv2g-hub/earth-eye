import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import {
  isGraphicsInitFailure,
  createGraphicsFailedState,
  mountGraphicsRecoveryPanel,
  dismissLoadingScreen,
  clearCesiumErrorOverlay,
  defaultGraphicsRetry,
} from './app/graphicsRecovery.js';
import { installGlobeDiagnostics } from './app/globeDiagnosticsPanel.js';

installGlobeDiagnostics();

const application = createStandaloneApplication({
  googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,
  allowQaRegistration: import.meta.env.DEV,
});

application.start().catch((error) => {
  console.error('Earth Eye failed to start:', error);
  const loadingScreen = document.getElementById('loading-screen');
  const loaderStatus = document.querySelector('#loading-screen .loader-status');

  // Graphics/WebGL failure safety net: recoverable non-3D banner (high contrast).
  // Prefer the in-app non-3D path (scene returns graphicsFailed); this catches
  // failures that escape before that path.
  if (isGraphicsInitFailure(error)) {
    clearCesiumErrorOverlay(document);
    dismissLoadingScreen(loadingScreen);
    const state = createGraphicsFailedState(error);
    mountGraphicsRecoveryPanel({
      state,
      onRetry: () => defaultGraphicsRetry(),
    });
    if (loaderStatus) {
      loaderStatus.textContent = state.headline;
      loaderStatus.style.color = '#e8edf0';
      loaderStatus.style.animation = 'none';
    }
    return;
  }

  if (loaderStatus) {
    loaderStatus.textContent = `Error: ${describeError(error)}`;
    loaderStatus.style.color = '#ff4444';
    loaderStatus.style.animation = 'none';
  }
});

export { application };
