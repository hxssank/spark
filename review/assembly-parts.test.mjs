import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { indexAssemblyParts } from './assembly-parts.mjs';

const bytes = await readFile(new URL('../mechanical/exports/spark_assembly.glb', import.meta.url));
const { scene } = await new Promise((resolve, reject) => new GLTFLoader().parse(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject,
));
const index = indexAssemblyParts(scene);

test('CAD faces resolve to one inspectable part per assembly child', () => {
  const names = new Set();
  let meshes = 0;
  scene.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    names.add(index.ownerName(object));
  });
  assert.ok(meshes > index.parts.size, 'The fixture must exercise multi-face CAD parts.');
  assert.equal(names.size, index.parts.size);
  assert.ok(names.has('sleeve'));
  assert.ok(!names.has('sleeve_1'));
});

test('all OLED faces resolve to the complete active-area envelope', () => {
  const display = index.parts.get('display_active_reference');
  assert.ok(display, 'The display must be available for the texture and controls.');
  display.traverse(object => {
    if (object.isMesh) assert.equal(index.ownerName(object), 'display_active_reference');
  });
  const size = new THREE.Box3().setFromObject(display).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 10.73) < 0.001);
  assert.ok(Math.abs(size.y - 10.73) < 0.001);
  assert.ok(Math.abs(size.z - 0.03) < 0.001);
});
