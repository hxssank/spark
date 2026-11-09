import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHandReference } from './hand-reference.js';

const hand = createHandReference();
const mesh = hand.group.children[0];
const positions = mesh.geometry.attributes.position;

function distance(first, second) {
  return new THREE.Vector3(...first).distanceTo(new THREE.Vector3(...second));
}

test('the illustrative open hand retains adult scale and the actual Spark placement', () => {
  hand.setGrip(0);
  const middleTip = hand.getJointPositions().Middle.at(-1);
  assert.ok(Math.abs(distance(hand.wrist, middleTip) + 6.7 - hand.handLengthMm) < 3);
  assert.deepEqual(hand.placement.spark, [0, 0, 0]);
  assert.ok(hand.extent.width > 185 && hand.extent.width < 210);
  assert.ok(hand.framingBox.containsPoint(new THREE.Vector3(...middleTip)));
});

test('the articulated skin clears Spark through the entire sampled closing motion', () => {
  const point = new THREE.Vector3();
  for (let step = 0; step <= 20; step++) {
    hand.setGrip(step / 20);
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index);
      mesh.applyBoneTransform(index, point);
      const penetration = Math.min(12 - Math.abs(point.x), 58 - Math.abs(point.y), 7.4 - Math.abs(point.z));
      assert.ok(penetration <= 0.25, `Skin enters Spark by ${penetration} mm at grip ${step / 20}`);
    }
  }
});

test('all finger segments retain their lengths and the thumb opposes the closed fingers', () => {
  const lengths = { Index: [32, 24, 17], Middle: [35, 26, 19], Ring: [33, 24, 17], Little: [28, 20, 15], Thumb: [35, 26, 20] };
  for (const progress of [0, 0.5, 1]) {
    hand.setGrip(progress);
    for (const [name, points] of Object.entries(hand.getJointPositions())) {
      lengths[name].forEach((length, segment) => assert.ok(Math.abs(distance(points[segment], points[segment + 1]) - length) < 0.0001));
    }
  }
  const closed = hand.getJointPositions();
  assert.ok(closed.Index.at(-1)[0] < -12 && closed.Index.at(-1)[2] > 14);
  assert.ok(closed.Thumb.at(-1)[0] < -16 && closed.Thumb.at(-1)[2] > 12);
  assert.ok(Math.abs(closed.Thumb.at(-1)[1] - closed.Index.at(-1)[1]) < 8);
});

test('replay finishes and leaves no idle animation work or replacement geometry', () => {
  const geometry = mesh.geometry;
  hand.replayGrip();
  assert.equal(hand.gripProgress, 0);
  for (let frame = 0; frame < 110; frame++) hand.update(1 / 60);
  assert.equal(hand.gripProgress, 1);
  assert.equal(hand.isAnimating, false);
  assert.equal(hand.update(1 / 60), false);
  assert.equal(mesh.geometry, geometry);
  const firstClose = hand.getJointPositions();
  hand.setGrip(0);
  hand.setGrip(1);
  assert.deepEqual(hand.getJointPositions(), firstClose);
  hand.replayGrip();
  hand.setGrip(1);
  assert.equal(hand.update(0.2), false);
  assert.throws(() => hand.setGrip(NaN), /finite/);
  hand.setGrip(-2);
  assert.equal(hand.gripProgress, 0);
  hand.setGrip(2);
  assert.equal(hand.gripProgress, 1);
});

test('palm and digits form one connected skin before articulation', () => {
  const vertices = new Map();
  const parent = [];
  function root(index) {
    while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; }
    return index;
  }
  for (let index = 0; index < positions.count; index += 3) {
    const triangle = [];
    for (let corner = 0; corner < 3; corner++) {
      const at = index + corner;
      const key = [positions.getX(at), positions.getY(at), positions.getZ(at)].map(value => value.toFixed(3)).join(',');
      if (!vertices.has(key)) { vertices.set(key, parent.length); parent.push(parent.length); }
      triangle.push(vertices.get(key));
    }
    parent[root(triangle[1])] = root(triangle[0]);
    parent[root(triangle[2])] = root(triangle[0]);
  }
  assert.equal(new Set(parent.map((_, index) => root(index))).size, 1);
});
