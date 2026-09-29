import { SceneDirector } from '../scenes/director.js';
import { initAnnotations } from '../annotations/index.js';
import { initDrawTool } from '../annotations/drawTool.js';
import { initImageryBoxTool } from '../ui/imageryBoxTool.js';
import { createRecentImageryPanel } from '../ui/recentImagery.js';
import { initGevVoiceCommands } from '../voice/gevRealtime.js';
import { createGevActionRunner } from '../voice/gevActions.js';
import { initAtlasConsole } from '../atlas/console.js';
import { installScopeMask, destroyScopeMask } from '../scopeMask.js';
import {
  installRenderGovernor,
  getRenderGovernorDiagnostics,
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';
import { applyMobileGpuTuning } from './mobileGpuProfile.js';
import {
  mountGraphicsRecoveryPanel,
  dismissLoadingScreen,
  clearCesiumErrorOverlay,
  labelMapDependentUnavailable,
  defaultGraphicsRetry,
  degradedRunAction,
  setForceNon3dFlag,
} from './graphicsRecovery.js';

/** Attach scene tools, rendering listeners and the application debug handle. */
export function createApplicationTools({
  scene,
  controls,
  data,
  loadingScreen,
  placeSearch,
  voice = {},
  startChrome,
  onSceneDirector,
  sceneDataPacks,
  signal,
  defer,
}) {
  const { viewer, tileset, mapStackController, operations, graphicsFailed, graphicsState } =
    scene;

  // ── Non-3D / graphics-failed audit mode ─────────────────────────────
  // Auth/nav/panels already independently of Cesium. Mount recoverable UI,
  // keep shell usable on real APIs, label 3D-only actions UNAVAILABLE.
  if (graphicsFailed || !viewer) {
    clearCesiumErrorOverlay(document);
    dismissLoadingScreen(loadingScreen);
    const { styleManager } = controls;
    const { dataManager } = data;
    const runAction = (name, args) => degradedRunAction(name, args);
    const atlasConsole = initAtlasConsole({
      viewer: null,
      dataManager,
      styleManager,
      sceneDirector: null,
      runAction,
      signal,
      graphicsFailed: true,
      graphicsState: graphicsState || null,
    });
    defer(() => atlasConsole.destroy());
    const recovery = mountGraphicsRecoveryPanel({
      state:
        graphicsState || {
          headline:
            '3D view is unavailable in this browser. You can still explore available data.',
          message: 'Graphics initialization failed.',
          detail:
            'Place search, cameras, World Events, source health, and Analyst remain available on real APIs. Fly-to, Follow, and Cockpit are UNAVAILABLE.',
        },
      onRetry: () => defaultGraphicsRetry(),
      onContinue: () => {
        setForceNon3dFlag(true);
        labelMapDependentUnavailable(document.getElementById('atlas-console') || document.body);
      },
    });
    defer(() => recovery.destroy());
    labelMapDependentUnavailable(
      document.getElementById('atlas-console') || document.body,
    );
    if (startChrome)
      defer(
        startChrome({
          loadingScreen,
          styleManager,
          dataManager,
          signal,
        }),
      );
    window.__godsEyeView = {
      viewer: null,
      graphicsFailed: true,
      styleManager,
      dataManager,
      surfaceServices: operations?.surface || null,
    };
    window.__atlasEye = Object.assign(window.__atlasEye || {}, {
      app: window.__godsEyeView,
      runAction,
      graphicsFailed: true,
    });
    defer(() => {
      if (window.__godsEyeView?.graphicsFailed) delete window.__godsEyeView;
    });
    return {
      sceneDirector: null,
      annotations: null,
      voiceCommands: null,
      graphicsFailed: true,
      atlasConsole,
    };
  }

  applyMobileGpuTuning(viewer);
  const { styleManager, weatherEffects, cockpitCloudEffects } = controls;
  const { dataManager } = data;
  const sceneDirector = new SceneDirector(viewer, styleManager, dataManager, {
    dataPacks: sceneDataPacks,
    isMapStackAvailable: (id) =>
      mapStackController?.isStackAvailable(id) === true,
  });
  dataManager.layers
    .get('bhote-koshi-2026')
    ?.module.attachSceneController(sceneDirector);
  defer(() => sceneDirector.destroy());
  onSceneDirector?.(sceneDirector);
  const annotations = initAnnotations({
    viewer,
    tileset,
    placeSearch,
    resolver: operations.annotationResolver,
  });
  defer(() => {
    if (window.__gevAnnotations === annotations) delete window.__gevAnnotations;
    annotations.destroy();
  });
  // DISPLAY ▸ Draw: the same whiteboard, drawn by hand. It claims the pointer
  // while a session is open, so its teardown belongs to the application
  // lifetime rather than to whoever last pressed the button.
  const drawTool = initDrawTool({ viewer, annotations });
  defer(() => drawTool?.destroy());
  // DATA ▸ Recent Imagery: the box tool claims the pointer like Draw and the
  // panel lives on the right rail, so both belong to the application
  // lifetime. The tileset lets the layer drape while the globe is hidden.
  const recentImagery = dataManager.layers.get('recent-imagery')?.module;
  if (recentImagery) {
    recentImagery.attachTileset(tileset);
    const imageryBoxTool = initImageryBoxTool({
      viewer,
      onBox: (box) => recentImagery.setBox(box),
      onCancel: (reason, message, box) => {
        if (message) recentImagery.reportBoxRefusal(message, box);
      },
      onActive: (active) => recentImagery.setToolActive(active),
      // The tool takes Escape in a capture listener, so the panel's order
      // (clear a preview before cancelling the tool) is applied here.
      onEscape: () => recentImagery.clearPreview(),
    });
    // The readout mounts in its rail body through the layer panel, like the
    // weather readout.
    data.presentation.attachRecentImagery((container) =>
      createRecentImageryPanel({
        container,
        viewer,
        layer: recentImagery,
        tool: imageryBoxTool,
      }),
    );
    // The live gate's handle (scripts/qa-recent-imagery.mjs).
    const recentImageryHandle = { layer: recentImagery, tool: imageryBoxTool };
    window.__gevRecentImagery = recentImageryHandle;
    defer(() => {
      if (window.__gevRecentImagery === recentImageryHandle)
        delete window.__gevRecentImagery;
      data.presentation.attachRecentImagery(null);
      imageryBoxTool?.destroy();
    });
  }
  if (startChrome)
    defer(startChrome({ loadingScreen, styleManager, dataManager, signal }));
  // Idle render governor: flips the scene into requestRenderMode whenever
  // nothing animates per frame. Installed AFTER every module above has had
  // its chance to register pre-install holds. (perf wave 2)
  installRenderGovernor(viewer);

  // Install the explicit scope mask used by the DISPLAY controls.
  installScopeMask(viewer);
  defer(() => destroyScopeMask());

  // The follow camera recomputes the tracked target's dead-reckon position
  // every frame — tracking anything is a per-frame animation. (perf wave 2)
  const removeTrackingListener = viewer.trackedEntityChanged.addEventListener(
    () => {
      if (viewer.trackedEntity) holdContinuousRender('tracked-entity');
      else releaseContinuousRender('tracked-entity');
    },
  );

  // Hidden-state suspension (perf wave 2): when the window/tab is hidden,
  // stop the default render loop outright — a hidden canvas repaints for
  // nobody, and browser rAF throttling still lets throttled frames burn
  // GPU. Holder/data state is untouched, so return is seamless: restore
  // the loop, refresh the one DOM surface we gated, render a frame.
  const syncVisibilitySuspension = () => {
    const hidden = document.hidden;
    viewer.useDefaultRenderLoop = !hidden;
    cockpitCloudEffects?.setSuspended?.(hidden);
    if (!hidden) {
      data.presentation.flushVisible();
      governorRequestRender('visibility-restore');
    }
  };
  document.addEventListener('visibilitychange', syncVisibilitySuspension);
  defer(() =>
    document.removeEventListener('visibilitychange', syncVisibilitySuspension),
  );
  defer(() => {
    removeTrackingListener();
    releaseContinuousRender('tracked-entity');
  });
  // Apply the CURRENT state too — bootstrap can complete while the tab is
  // already hidden, and waiting for the next transition would leave the
  // loop burning behind a hidden tab. (perf wave 2 fix)
  syncVisibilitySuspension();

  window.__godsEyeView = {
    viewer,
    styleManager,
    tileset,
    dataManager,
    sceneDirector,
    mapStackController,
    annotations,
    weatherEffects,
    cockpitCloudEffects,
    getRenderGovernorDiagnostics,
    surfaceServices: operations.surface,
    requestRender: governorRequestRender,
  };
  const debug = window.__godsEyeView;
  defer(() => {
    if (window.__godsEyeView === debug) delete window.__godsEyeView;
  });
  const voiceCommands = initGevVoiceCommands({
    ...voice,
    floorServices: operations.surface.groundFloor,
    annotationResolver: operations.annotationResolver,
    searchNavigation: operations.searchAndFlyTo,
    signal,
    placeSearch,
    viewer,
    styleManager,
    dataManager,
    sceneDirector,
    annotations,
  });
  defer(() => {
    voiceCommands.stop({ removeUi: true });
    if (window.__gevVoiceCommands === voiceCommands)
      delete window.__gevVoiceCommands;
  });
  debug.voiceCommands = voiceCommands;
  // Earth Eye: typed commands drive a second runner over the same scene
  // services the voice agent uses, so both paths share one action vocabulary.
  const atlasRunner = createGevActionRunner({
    ...voice,
    floorServices: operations.surface.groundFloor,
    annotationResolver: operations.annotationResolver,
    searchNavigation: operations.searchAndFlyTo,
    placeSearch,
    viewer,
    styleManager,
    dataManager,
    sceneDirector,
    annotations,
  });
  const atlasConsole = initAtlasConsole({
    viewer,
    dataManager,
    styleManager,
    sceneDirector,
    runAction: (name, args) => atlasRunner(name, args, { signal }),
    signal,
  });
  defer(() => atlasConsole.destroy());
  window.__atlasEye = Object.assign(window.__atlasEye || {}, {
    app: debug,
    runAction: (name, args) => atlasRunner(name, args, { signal }),
  });
  return { sceneDirector, annotations, voiceCommands };
}
