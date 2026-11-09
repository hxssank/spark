import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMotionState, handleViewerShortcut, highlightPart, restoreHighlight, stepOrbit } from './viewer-interactions.mjs';

test('viewer shortcuts leave browser zoom, navigation and assistive shortcuts alone', () => {
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'isComposing', 'defaultPrevented']) {
    for (const key of ['+', '-', 'ArrowLeft', ' ']) {
      const event = { key, [modifier]: true, preventDefault() { assert.fail('Browser shortcut was consumed'); } };
      const actions = { [key]: () => assert.fail('Model shortcut ran') };
      assert.equal(handleViewerShortcut(event, actions, () => assert.fail('Motion changed')), false);
    }
  }
});

test('viewer handles plain keys once and does not toggle motion on held space', () => {
  const calls = [];
  const actions = { '+': () => calls.push('zoom'), ' ': () => calls.push('toggle') };
  const event = key => ({ key, preventDefault() { calls.push('prevent'); } });
  assert.equal(handleViewerShortcut(event('+'), actions, () => calls.push('pause')), true);
  assert.deepEqual(calls, ['prevent', 'pause', 'zoom']);
  calls.length = 0;
  handleViewerShortcut(event(' '), actions);
  handleViewerShortcut({ ...event(' '), repeat: true }, actions);
  assert.deepEqual(calls, ['prevent', 'toggle', 'prevent']);
  assert.equal(handleViewerShortcut(event('Tab'), actions), false);
  assert.equal(handleViewerShortcut(event('constructor'), actions), false);
});

function orbit(baseYaw = 0) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(Math.sin(baseYaw) * 100, 20, Math.cos(baseYaw) * 100);
  const controls = new OrbitControls(camera, null);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.update();
  const angle = () => {
    const offset = camera.position.clone().sub(controls.target);
    return THREE.MathUtils.radToDeg(THREE.MathUtils.euclideanModulo(
      Math.atan2(offset.x, offset.z) - baseYaw + Math.PI, 2 * Math.PI,
    ) - Math.PI);
  };
  return { camera, controls, angle };
}

test('manual orbit crosses both old 45-degree limits and completes a full turn', () => {
  const { controls, angle, camera } = orbit();
  const initial = camera.position.clone();
  for (let index = 0; index < 9; index++) stepOrbit(controls, 10);
  assert.ok(Math.abs(angle() - 90) < 1e-9);
  for (let index = 0; index < 27; index++) stepOrbit(controls, 10);
  assert.ok(camera.position.distanceTo(initial) < 1e-8);
  for (let index = 0; index < 9; index++) stepOrbit(controls, -10);
  assert.ok(Math.abs(angle() + 90) < 1e-9);
});

test('automatic orbit follows elapsed time, including the first zero-delta frame', () => {
  function advance(frames) {
    const { controls, angle } = orbit();
    controls.enableDamping = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.update(0);
    assert.ok(Math.abs(angle()) < 1e-9);
    for (let frame = 0; frame < frames; frame++) controls.update(1 / frames);
    return angle();
  }
  assert.ok(Math.abs(advance(30) - advance(120)) < 1e-8);
  assert.ok(Math.abs(advance(60) + 3) < 1e-8);
});

test('reduced motion starts paused and a drag pause persists until explicit resume', () => {
  const motion = createMotionState({ reducedMotion: true });
  assert.equal(motion.active, false);
  motion.play();
  assert.equal(motion.active, true);
  motion.pause();
  motion.setReducedMotion(false);
  assert.equal(motion.active, false);
  motion.play();
  motion.setReducedMotion(true);
  assert.equal(motion.active, false);
});

test('a manual turn discards pending drag damping and steps from the visible angle', () => {
  const { controls, angle, camera } = orbit();
  controls.rotateLeft(0.4);
  controls.update();
  const before = angle();
  const height = camera.position.y;
  const distance = camera.position.distanceTo(controls.target);
  stepOrbit(controls, 10, 0);
  assert.ok(Math.abs(angle() - before - 10) < 1e-9);
  for (let i = 0; i < 60; i++) controls.update();
  assert.ok(Math.abs(angle() - before - 10) < 1e-9);
  assert.ok(Math.abs(camera.position.y - height) < 1e-9);
  assert.ok(Math.abs(camera.position.distanceTo(controls.target) - distance) < 1e-9);
  assert.equal(controls.enableDamping, true);
});

test('selection skips shared detail materials and restores shared CAD materials once', () => {
  const part = new THREE.Group();
  const cad = new THREE.MeshStandardMaterial({ emissive: 0x010203 });
  const detail = new THREE.MeshStandardMaterial({ emissive: 0x040506 });
  const geometry = new THREE.BoxGeometry();
  part.add(new THREE.Mesh(geometry, cad), new THREE.Mesh(geometry, cad));
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh(geometry, detail);
    mesh.userData.visualDetail = true;
    part.add(mesh);
  }
  const otherPartDetail = new THREE.Mesh(geometry, detail);
  const saved = highlightPart(part);
  assert.equal(saved.length, 1);
  assert.equal(cad.emissive.getHex(), 0x193023);
  assert.equal(otherPartDetail.material.emissive.getHex(), 0x040506);
  restoreHighlight(saved);
  assert.equal(cad.emissive.getHex(), 0x010203);
  assert.equal(detail.emissive.getHex(), 0x040506);
});
