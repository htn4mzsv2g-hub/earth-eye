import { LayerLifecycle } from '../data/lifecycle.js';
import { LayerPresentation } from './layerPresentation.js';
import { createCyberSonarScene } from '../cyberSonarScene.js';
import { applyServerPolicy, atlasEnablePolicy } from '../atlas/enablePolicy.js';
import {
  createDegradedDataManager,
  createDegradedPresentation,
} from './graphicsRecovery.js';
/** Register the application layer catalog before allowing state restoration. */
export function createApplicationData({
  scene,
  controls: { styleManager },
  catalog,
  allowQaRegistration,
  onData,
  defer,
}) {
  const { viewer, mapStackController, graphicsFailed } = scene;
  // Non-3D: no Cesium layer lifecycle — panels use real APIs (CCTV, events,
  // capabilities, geocode). Registry source-health still renders.
  if (graphicsFailed || !viewer) {
    const dataManager = createDegradedDataManager();
    const presentation = createDegradedPresentation();
    onData?.(dataManager);
    return { dataManager, catalog, presentation, graphicsFailed: true };
  }
  // Initialize data layer manager
  const dataManager = new LayerLifecycle(viewer, {
    allowQaRegistration,
    // Earth Eye §3 / locked policy: one non-removable gate for every enable
    // path (toggle, setEnabled, scenes, URL/share restore, commands, voice).
    enablePolicy: atlasEnablePolicy,
  });
  void applyServerPolicy(dataManager);
  defer(async () => {
    await dataManager.destroyAll();
    if (dataManager.layers.size)
      throw new Error(
        `Data layers could not be destroyed: ${[...dataManager.layers.keys()].join(', ')}`,
      );
  });
  const presentation = new LayerPresentation(dataManager, {
    weatherClock: catalog?.weatherClock,
  });
  defer(() => presentation.destroy());
  onData?.(dataManager);
  if (!catalog?.layers || !catalog?.metadata)
    throw new TypeError('An application layer catalog is required');
  for (const layer of catalog.layers) dataManager.register(layer);
  for (const layer of catalog.layers) layer.attachDataManager?.(dataManager);
  for (const layer of catalog.layers)
    layer.attachMapStackController?.(mapStackController);
  // Restoration starts only after the caller's complete registry is sealed.
  dataManager.finalizeRegistrations(catalog.metadata);
  if (allowQaRegistration) {
    window.__gevQaRegisterLayer = (targetManager, layerModule) => {
      if (targetManager !== dataManager)
        throw new Error('QA layer manager mismatch');
      return dataManager.registerForQa(layerModule);
    };
    window.__gevQaUnregisterLayer = (targetManager, layerId) => {
      if (targetManager !== dataManager)
        throw new Error('QA layer manager mismatch');
      return dataManager.unregisterForQa(layerId);
    };
    const register = window.__gevQaRegisterLayer;
    const unregister = window.__gevQaUnregisterLayer;
    defer(() => {
      if (window.__gevQaRegisterLayer === register)
        delete window.__gevQaRegisterLayer;
      if (window.__gevQaUnregisterLayer === unregister)
        delete window.__gevQaUnregisterLayer;
    });
  }
  presentation.mount(document.getElementById('data-toggles'));
  styleManager.attachDataManager(dataManager);
  defer(createCyberSonarScene(viewer, dataManager));

  return { dataManager, catalog, presentation };
}
