import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraInputOwnerName,
  installCameraInputTrace,
  readCameraInputTrace,
  resetCameraInputTrace,
  restoreCameraInputsUnlessCockpit,
} from './cameraInputTrace.js';

function controller() {
  function CameraController() {
    this.stored = true;
  }
  Object.defineProperty(CameraController.prototype, 'enableInputs', {
    configurable: true,
    enumerable: true,
    get() {
      return this.stored;
    },
    set(value) {
      this.stored = value;
    },
  });
  return new CameraController();
}

test('a false camera input is traced and restored when cockpit is not active', () => {
  resetCameraInputTrace();
  const camera = controller();
  const viewer = { scene: { screenSpaceCameraController: camera } };
  assert.equal(installCameraInputTrace(viewer), true);
  camera.enableInputs = false;
  const traced = readCameraInputTrace();
  assert.equal(traced.lastDisable.value, false);
  assert.equal(typeof traced.lastDisable.stack, 'string');
  assert.ok(traced.lastDisable.stack.length > 0);

  const cockpit = {
    body: { classList: { contains: (name) => name === 'cockpit-mode' } },
  };
  assert.equal(restoreCameraInputsUnlessCockpit(viewer, cockpit, 'diag-close'), 'cockpit');
  assert.equal(camera.enableInputs, false);

  const page = { body: { classList: { contains: () => false } } };
  assert.equal(restoreCameraInputsUnlessCockpit(viewer, page, 'diag-close'), 'restored');
  assert.equal(camera.enableInputs, true);
  assert.equal(readCameraInputTrace().restores.at(-1).reason, 'diag-close');
  assert.equal(readCameraInputTrace().lastDisable.value, false);
  assert.equal(camera.enableRotate, true);
  assert.equal(camera.enableZoom, true);
  assert.equal(camera.enableTilt, true);
});

test('DIAG close leaves inputs false while the gizmo drag still owns them', () => {
  resetCameraInputTrace();
  const camera = controller();
  camera.enableInputs = false;
  camera.enableRotate = false;
  camera.enableZoom = false;
  camera.enableTilt = false;
  const viewer = { scene: { screenSpaceCameraController: camera } };
  globalThis.__eeCameraInputHold = 'cctvGizmo';
  const page = { body: { classList: { contains: () => false } } };
  assert.equal(restoreCameraInputsUnlessCockpit(viewer, page, 'diag-close'), 'cctvGizmo');
  assert.equal(camera.enableInputs, false);
  assert.equal(camera.enableRotate, false);
  globalThis.__eeCameraInputHold = null;
  assert.equal(restoreCameraInputsUnlessCockpit(viewer, page, 'diag-close'), 'restored');
  assert.equal(camera.enableInputs, true);
  assert.equal(camera.enableRotate, true);
  assert.equal(camera.enableZoom, true);
  assert.equal(camera.enableTilt, true);
});

test('a disable stack names the module that wrote enableInputs false', () => {
  assert.equal(
    cameraInputOwnerName('at cctvGizmo.js:537\nat beginDrag'),
    'cctvGizmo',
  );
  assert.equal(cameraInputOwnerName('at startupChrome.js'), 'untraced');
});
