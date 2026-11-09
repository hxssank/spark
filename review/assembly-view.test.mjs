import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { indexAssemblyParts } from './assembly-parts.mjs';
import { assemblyOffsets, createAssemblyView } from './assembly-view.js';

async function fixture() {
  const bytes = await readFile(new URL('../mechanical/exports/spark_assembly.glb', import.meta.url));
  const { scene: model } = await new Promise((resolve, reject) => new GLTFLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject,
  ));
  const bounds = new THREE.Box3().setFromObject(model);
  model.position.sub(bounds.getCenter(new THREE.Vector3()));
  const scene = new THREE.Scene();
  scene.add(model);
  model.updateMatrixWorld(true);
  const partIndex = indexAssemblyParts(model);
  const view = createAssemblyView({ model, partIndex });
  return { model, partIndex, view };
}

test('sleeve fully withdraws before moving aside, while the cover waits', () => {
  assert.deepEqual(assemblyOffsets(0.06).bottom_cap, [0, -10, 0]);
  assert.deepEqual(assemblyOffsets(0.12).bottom_cap, [29, -10, 0]);
  const sliding = assemblyOffsets(0.4);
  assert.equal(Math.abs(sliding.sleeve[0]), 0);
  assert.ok(sliding.sleeve[1] < -60);
  assert.deepEqual(sliding.front_cover, [0, 0, -0]);
  const withdrawn = assemblyOffsets(0.62);
  assert.equal(withdrawn.sleeve[1], -118);
  assert.equal(Math.abs(withdrawn.sleeve[0]), 0);
  const aside = assemblyOffsets(0.82);
  assert.equal(aside.sleeve[0], -38);
  assert.equal(aside.sleeve[1], -118);
  assert.deepEqual(assemblyOffsets(1).sleeve, [-38, 0, 0]);
});

test('opening preserves case parts and restores every original transform', async () => {
  const { partIndex, view } = await fixture();
  const positions = new Map([...partIndex.parts].map(([name, part]) => [name, part.position.toArray()]));
  const getCenter = name => new THREE.Box3().setFromObject(partIndex.parts.get(name)).getCenter(new THREE.Vector3());
  const initialSleeve = getCenter('sleeve');
  const initialLens = getCenter('display_lens_reference');
  const initialDisplay = getCenter('display_glass_reference');
  view.setOpen(true);
  assert.equal(view.isOpen, true);
  assert.equal(partIndex.parts.get('sleeve').visible, true);
  assert.equal(partIndex.parts.get('front_cover').visible, true);
  assert.equal(partIndex.parts.get('bottom_cap').visible, true);
  assert.ok(getCenter('sleeve').sub(initialSleeve).distanceTo(new THREE.Vector3(-38, 0, 0)) < 1e-8);
  assert.ok(getCenter('display_lens_reference').sub(initialLens).distanceTo(new THREE.Vector3(-38, 0, 0)) < 1e-8);
  assert.ok(getCenter('display_glass_reference').distanceTo(initialDisplay) < 1e-8);
  view.setOpen(0.4);
  view.reset();
  for (const [name, part] of partIndex.parts) assert.deepEqual(part.position.toArray(), positions.get(name), name);
  view.dispose();
});

test('visual details retain the owning CAD part for picking', async () => {
  const { partIndex, view } = await fixture();
  assert.ok(view.pickables.length > 100);
  for (const mesh of view.pickables) {
    assert.ok(partIndex.parts.has(partIndex.ownerName(mesh)), mesh.name);
  }
  assert.equal(partIndex.parts.get('display_fpc_keepout_reference').visible, false);
  assert.ok(view.pickables.some(mesh => mesh.userData.illustrativeRouting));
  view.dispose();
  assert.equal(partIndex.parts.get('display_fpc_keepout_reference').visible, true);
});

test('the 10.73 mm display stays on the OLED behind the flush transparent lens', async () => {
  const { partIndex, view } = await fixture();
  const { screenPresentation } = view;
  const lens = partIndex.parts.get('display_lens_reference');
  const lensBounds = new THREE.Box3().setFromObject(lens);
  const panelBounds = new THREE.Box3().setFromObject(partIndex.parts.get('display_active_reference'));
  assert.ok(Math.abs(screenPresentation.z - panelBounds.max.z - 0.015) < 1e-8);
  assert.ok(screenPresentation.z < lensBounds.min.z, 'The graphic must remain beneath the cover glass.');
  assert.ok(Math.abs(screenPresentation.widthMm - 10.73) < 0.001);
  assert.ok(Math.abs(screenPresentation.heightMm - 10.73) < 0.001);
  const lensSize = lensBounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(lensSize.x - 16.8) < 0.001, 'The physical lens keeps its CAD dimensions.');
  assert.ok(Math.abs(lensSize.y - 19.3) < 0.001);
  lens.traverse(object => {
    if (!object.isMesh) return;
    assert.equal(object.material.transparent, true);
    assert.equal(object.material.depthWrite, false);
  });
  const screen = new THREE.Object3D();
  screen.position.copy(screenPresentation.center);
  screen.position.z = screenPresentation.z;
  screenPresentation.part.attach(screen);
  const closed = screen.getWorldPosition(new THREE.Vector3());
  view.setOpen(true);
  assert.ok(screen.getWorldPosition(new THREE.Vector3()).distanceTo(closed) < 1e-8);
  view.dispose();
});

test('the seamless finish matches the sleeve and reveals the physical lens when opened', async () => {
  const { partIndex, view } = await fixture();
  const finish = view.screenPresentation.exterior.part;
  assert.equal(finish.parent, partIndex.parts.get('sleeve'));
  assert.equal(finish.geometry.parameters.width, 17.2);
  assert.equal(finish.geometry.parameters.height, 19.7);
  assert.equal(finish.material.color.getHex(), 0x272d35);
  assert.equal(finish.material.metalness, 0.72);
  assert.equal(finish.material.roughness, 0.32);
  assert.equal(finish.castShadow, false);
  assert.equal(finish.receiveShadow, false);
  assert.equal(finish.visible, true);
  assert.equal(partIndex.parts.get('display_lens_reference').visible, false);
  for (const progress of [0.001, 0.4, 1]) {
    view.setOpen(progress);
    assert.equal(finish.visible, false, 'The finish study must not conceal the open CAD assembly.');
    assert.equal(partIndex.parts.get('display_lens_reference').visible, true);
  }
  view.reset();
  assert.equal(finish.visible, true);
  view.dispose();
  assert.equal(finish.parent, null);
  assert.equal(partIndex.parts.get('display_lens_reference').visible, true);
});

test('changing finish keeps the display legible and preserves the assembly geometry', async () => {
  const { model, partIndex, view } = await fixture();
  const before = new THREE.Box3().setFromObject(model);
  const lens = view.screenPresentation.exterior.part;
  assert.equal(view.setFinish('titanium'), true);
  for (const name of ['sleeve', 'bottom_cap']) {
    partIndex.parts.get(name).traverse(object => {
      if (object.isMesh && !object.userData.visualDetail) assert.equal(object.material.color.getHex(), 0x92908b);
    });
  }
  assert.equal(lens.material.color.getHex(), 0x272d35);
  assert.equal(view.setFinish('missing'), false);
  assert.equal(view.setFinish('graphite'), true);
  const after = new THREE.Box3().setFromObject(model);
  assert.ok(before.min.distanceTo(after.min) < 1e-8);
  assert.ok(before.max.distanceTo(after.max) < 1e-8);
  view.dispose();
});
