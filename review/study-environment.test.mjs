import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStudyEnvironment } from './study-environment.js';

test('study floor follows assembly without changing product geometry', () => {
  const scene = new THREE.Scene();
  const study = createStudyEnvironment(scene, { floorY: -58 });
  assert.equal(study.group.position.y, -58);
  const desk = study.group.getObjectByName('Solid oak desktop');
  assert.ok(desk);
  assert.ok(study.group.getObjectByName('Green glass banker lamp'));
  assert.ok(study.group.getObjectByName('Limestone fireplace'));
  study.setFloorY(-90);
  assert.equal(study.group.position.y, -90);
  assert.equal(desk.position.y, -16);
});

test('paused or hidden study does not advance animation or request frames', () => {
  const study = createStudyEnvironment(new THREE.Scene());
  const flame = study.group.getObjectByName('Firelight');
  const original = flame.scale.clone();
  assert.equal(study.update(0), false);
  study.setMotionEnabled(false);
  assert.equal(study.update(0.04), false);
  assert.deepEqual(flame.scale.toArray(), original.toArray());
  study.setMotionEnabled(true);
  assert.equal(study.update(0.04), true);
  const moving = flame.scale.clone();
  study.setVisible(false);
  assert.equal(study.update(0.04), false);
  assert.deepEqual(flame.scale.toArray(), moving.toArray());
});
