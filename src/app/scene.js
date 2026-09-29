import { createApplicationOperations } from './operations.js';
import * as Cesium from 'cesium';
import {
  createApplicationViewer,
  installTrackpadPinchZoom,
} from '../app/viewer.js';
import { registerDataCredits } from '../data/dataCredits.js';
import { configureCreditKeyboardAccess } from '../creditKeyboard.js';
import { MapStackController } from '../mapStackController.js';
import { loadPhotorealisticTileset } from '../mapStartup.js';
import {
  attachGooglePhotorealQuotaGovernor,
  GOOGLE_PHOTOREAL_CREDIT_HTML,
} from '../maps/googlePhotorealQuota.js';
import { initLogoGaze } from '../logoGaze.js';
import {
  uninstallRenderGovernor,
  governorRequestRender,
} from '../renderGovernor.js';
import { describeError } from './errors.js';
import {
  isGraphicsInitFailure,
  wrapGraphicsInitFailure,
  createGraphicsFailedScene,
  shouldForceNon3dMode,
  clearCesiumErrorOverlay,
  setForceNon3dFlag,
} from './graphicsRecovery.js';

/** Construct the application globe using the caller's local configuration. */
export async function createApplicationScene({
  requestServices,
  googleApiKey,
  cesiumToken,
  credits,
  MapController = MapStackController,
  mapOptions = {},
  loaderStatus,
  signal,
  defer,
}) {
  const operations = createApplicationOperations({
    requests: requestServices,
    signal,
  });
  defer(initLogoGaze());
  const previousKey = window.__GOOGLE_MAPS_API_KEY__;
  if (googleApiKey) {
    window.__GOOGLE_MAPS_API_KEY__ = googleApiKey;
    defer(() => {
      if (window.__GOOGLE_MAPS_API_KEY__ !== googleApiKey) return;
      if (previousKey === undefined) delete window.__GOOGLE_MAPS_API_KEY__;
      else window.__GOOGLE_MAPS_API_KEY__ = previousKey;
    });
  }
  // Deliberate non-3D audit entry (?ee_non3d=1) — same auth, no Cesium.
  if (shouldForceNon3dMode()) {
    loaderStatus.textContent = 'Non-3D mode — skipping globe…';
    clearCesiumErrorOverlay(document);
    return createGraphicsFailedScene({
      error: null,
      operations,
      forced: true,
    });
  }

  loaderStatus.textContent = 'Configuring viewer...';
  // Provider attribution stays visible, including clean-view and recording.
  const creditContainer = document.createElement('div');
  creditContainer.id = 'cesium-credits';
  document.body.appendChild(creditContainer);
  defer(() => creditContainer.remove());
  let viewer;
  try {
    viewer = createApplicationViewer({
      container: 'cesiumContainer',
      creditContainer,
    });
  } catch (error) {
    clearCesiumErrorOverlay(document);
    if (isGraphicsInitFailure(error)) {
      console.warn(
        '[Init] Graphics/WebGL initialization failed — entering non-3D mode:',
        describeError(error),
      );
      return createGraphicsFailedScene({
        error: wrapGraphicsInitFailure(error),
        operations,
        forced: false,
      });
    }
    throw error;
  }
  // A previous audit tab must not keep this visit in non-3D.
  setForceNon3dFlag(false);
  defer(() => {
    uninstallRenderGovernor(viewer);
    if (!viewer.isDestroyed()) viewer.destroy();
  });
  defer(installTrackpadPinchZoom(viewer));
  registerDataCredits(viewer, credits);
  configureCreditKeyboardAccess(document);
  loaderStatus.textContent =
    googleApiKey || cesiumToken
      ? 'Loading Google 3D Tiles...'
      : 'Loading the keyless globe...';
  const photoreal = await loadPhotorealisticTileset(Cesium, {
    googleApiKey,
    cesiumToken,
  });
  const tileset = photoreal.tileset;
  // A provider can finish after cancellation; retain ownership of its result.
  defer(() => {
    if (tileset && !tileset.isDestroyed()) {
      if (!viewer.scene.primitives.remove(tileset)) tileset.destroy();
    }
  });
  signal.throwIfAborted();
  const photorealStatus =
    photoreal.status ||
    ({
      reason: tileset
        ? `Google Photorealistic 3D via ${photoreal.route}`
        : 'Google Photorealistic 3D OFF — Esri keyless fallback',
    });
  if (tileset) {
    viewer.scene.primitives.add(tileset);
    // NOTE: Cesium World Terrain intentionally disabled — conflicts with Google 3D Tiles at high zoom.
    // Google Photorealistic 3D Tiles provide their own terrain/elevation.
    viewer.scene.globe.show = false;
    console.info(`[Init] ${photorealStatus.reason}`);
  } else {
    // Explicit Esri path — never silent OSM. OSM is final imagery fallback only.
    console.info(`[Init] ${photorealStatus.reason}`);
    if (photoreal.errors.length) {
      const tileError = photoreal.errors.at(-1);
      console.warn('[Init] Google 3D attempt failed:', tileError);
      loaderStatus.textContent = `${photorealStatus.reason}`;
    } else {
      loaderStatus.textContent =
        'Google Photorealistic 3D OFF (no key). Loading Esri satellite...';
    }
    viewer.scene.globe.show = true;
  }
  try {
    window.__eePhotorealStatus = photorealStatus;
  } catch {
    /* non-DOM hosts */
  }

  loaderStatus.textContent = 'Initializing systems...';

  const mapStackController = new MapController(viewer, {
    requestRender: governorRequestRender,
    ...mapOptions,
    googleTileset: tileset,
    cesiumToken,
    initialStack: tileset ? 'photoreal' : 'esri-imagery',
    // Task 5 (height-datum fix): rebroadcast stack changes as a window
    // CustomEvent so data layers (CCTV per-regime ground resolution) can
    // react without coupling MapStackController to layer modules. Fires on
    // 'switching'/'ready'/'error'; listeners derive the surface regime from
    // live scene state, so intermediate emissions are harmless.
    onChange: (state) => {
      window.dispatchEvent(
        new CustomEvent('gev:map-stack-changed', { detail: state }),
      );
    },
    onError: (message) => console.warn('[MapStack]', message),
  });
  defer(() => mapStackController.destroy());
  await mapStackController.setStack(tileset ? 'photoreal' : 'esri-imagery', {
    silent: true,
  });

  if (tileset) {
    const attr = document.createElement('div');
    attr.id = 'ee-google-attribution';
    attr.className = 'ee-google-attribution';
    attr.setAttribute('role', 'contentinfo');
    attr.innerHTML = GOOGLE_PHOTOREAL_CREDIT_HTML;
    document.body.appendChild(attr);
    defer(() => attr.remove());
    const quotaGov = attachGooglePhotorealQuotaGovernor({
      tileset,
      say: (html, tone) => {
        window.dispatchEvent(
          new CustomEvent('ee:operator-toast', {
            detail: { html, tone: tone || 'warn' },
          }),
        );
      },
      onHardStop: () => {
        attr.hidden = true;
        void mapStackController.setStack('esri-imagery', { silent: true });
      },
      onReport: (snap) => {
        try {
          window.__eePhotorealQuota = snap;
          if (snap.stopped) {
            window.__eePhotorealStatus = {
              ...photorealStatus,
              active: false,
              code: 'NEEDS_QUOTA',
              reason: snap.message,
              fallbackStackId: 'esri-imagery',
              billable: false,
            };
          }
        } catch {
          /* */
        }
        void fetch('/api/atlas/google-photoreal/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snap),
        }).catch(() => {});
      },
    });
    defer(() => quotaGov.destroy());
  }

  signal.throwIfAborted();
  return { viewer, tileset, mapStackController, operations };
}
