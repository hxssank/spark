import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

const WRIST = [-70, -36, -24];
const FIELD_CENTER = [9, -4, -21];
const FIELD_SIZE = [210, 150, 60];
const PALM = [
  [[-7, -6, -24], [36, 40, 14]],
  [[15, -1, -24], [19, 40, 13]],
  [[-23, 6, -23], [22, 26, 15]],
  [[-40, -24, -25], [30, 27, 13]],
  [[-65, -35, -25], [25, 22, 12]],
];
const DIGITS = [
  { name: 'Index', root: [20, 31, -20], lengths: [32, 24, 17], radii: [9, 8.1, 7.1, 6.5], fan: 16, angles: [82, 164, 184] },
  { name: 'Middle', root: [23, 10, -20], lengths: [35, 26, 19], radii: [9.4, 8.5, 7.5, 6.7], fan: 5, angles: [82, 165, 185] },
  { name: 'Ring', root: [23, -11, -20], lengths: [33, 24, 17], radii: [8.9, 8, 7, 6.2], fan: -7, angles: [80, 164, 183] },
  { name: 'Little', root: [21, -30, -20], lengths: [28, 20, 15], radii: [7.7, 6.9, 6, 5.3], fan: -20, angles: [76, 155, 177] },
  { name: 'Thumb', root: [-15, -10, -22], lengths: [35, 26, 20], radii: [14, 11.5, 9, 7.2],
    openDirections: [[-0.72, 0.69, 0], [-0.35, 0.94, 0.03], [-0.1, 0.94, 0.32]],
    closedDirections: [[-0.55, 0.835, 0], [0.15, 0.5, 0.853], [0.65, 0.1, 0.753]] },
];
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const DEG = Math.PI / 180;

function orientation(digit, segment, progress) {
  if (digit.name === 'Thumb') {
    const open = new THREE.Vector3(...digit.openDirections[segment]).normalize();
    const direction = open.clone().lerp(new THREE.Vector3(...digit.closedDirections[segment]).normalize(), progress).normalize();
    return new THREE.Quaternion().setFromUnitVectors(open, direction)
      .multiply(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, open));
  }
  return new THREE.Quaternion().setFromAxisAngle(Z_AXIS, digit.fan * DEG * (1 - progress))
    .multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -digit.angles[segment] * DEG * progress))
    .multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -Math.PI / 2));
}

function posePoints(digit, progress) {
  const points = [new THREE.Vector3(...digit.root)];
  digit.lengths.forEach((length, segment) => points.push(points.at(-1).clone().add(Y_AXIS.clone().applyQuaternion(orientation(digit, segment, progress)).multiplyScalar(length))));
  return points;
}

const OPEN_POINTS = DIGITS.map(digit => posePoints(digit, 0));

function smoothUnion(a, b, radius) {
  const blend = Math.max(radius - Math.abs(a - b), 0) / radius;
  return Math.min(a, b) - blend * blend * radius * 0.25;
}

function ellipsoidDistance(x, y, z, center, radius) {
  const p = [x - center[0], y - center[1], z - center[2]];
  const k0 = Math.hypot(...p.map((value, axis) => value / radius[axis]));
  const k1 = Math.hypot(...p.map((value, axis) => value / radius[axis] ** 2));
  return k1 === 0 ? -Math.min(...radius) : k0 * (k0 - 1) / k1;
}

function segmentAt(point, start, end, radius, endRadius) {
  const delta = end.clone().sub(start);
  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(delta) / delta.lengthSq(), 0, 1);
  return { t, distance: point.distanceTo(start.clone().addScaledVector(delta, t)) - THREE.MathUtils.lerp(radius, endRadius, t) };
}

function palmDistance(x, y, z) {
  let distance = 1000;
  for (const [center, radius] of PALM) distance = smoothUnion(distance, ellipsoidDistance(x, y, z, center, radius), 7);
  return distance;
}

export function handDistance(x, y, z) {
  let distance = palmDistance(x, y, z);
  for (let digit = 0; digit < DIGITS.length; digit++) {
    const spec = DIGITS[digit];
    const points = OPEN_POINTS[digit];
    for (let index = 0; index < 3; index++) {
      const start = points[index];
      const end = points[index + 1];
      const dx = end.x - start.x; const dy = end.y - start.y; const dz = end.z - start.z;
      const t = THREE.MathUtils.clamp(((x - start.x) * dx + (y - start.y) * dy + (z - start.z) * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
      const radius = THREE.MathUtils.lerp(spec.radii[index], spec.radii[index + 1], t);
      const value = Math.hypot(x - start.x - dx * t, y - start.y - dy * t, z - start.z - dz * t) - radius;
      distance = smoothUnion(distance, value, 3.5);
    }
  }
  return Math.max(distance, z + 8.5, -86 - x);
}

function skinGeometry(resolution) {
  const field = new MarchingCubes(resolution, new THREE.MeshBasicMaterial(), false, false, 100000);
  field.isolation = 0;
  for (let z = 0; z < resolution; z++) {
    const pz = FIELD_CENTER[2] + (z / resolution - 0.5) * FIELD_SIZE[2];
    for (let y = 0; y < resolution; y++) {
      const py = FIELD_CENTER[1] + (y / resolution - 0.5) * FIELD_SIZE[1];
      for (let x = 0; x < resolution; x++) {
        const px = FIELD_CENTER[0] + (x / resolution - 0.5) * FIELD_SIZE[0];
        field.field[x + y * resolution + z * resolution ** 2] = -handDistance(px, py, pz);
      }
    }
  }
  field.update();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(field.positionArray.slice(0, field.count * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(field.normalArray.slice(0, field.count * 3), 3));
  geometry.scale(...FIELD_SIZE.map(size => size / 2));
  geometry.translate(...FIELD_CENTER);
  field.geometry.dispose();
  field.material.dispose();
  return geometry;
}

function attachSkinWeights(geometry) {
  const position = geometry.attributes.position;
  const indices = []; const weights = []; const colors = [];
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex++) {
    point.fromBufferAttribute(position, vertex);
    let nearest = { distance: Infinity, digit: 0, segment: 0, t: 0 };
    for (let digit = 0; digit < DIGITS.length; digit++) {
      for (let segment = 0; segment < 3; segment++) {
        const spec = DIGITS[digit];
        const at = segmentAt(point, OPEN_POINTS[digit][segment], OPEN_POINTS[digit][segment + 1], spec.radii[segment], spec.radii[segment + 1]);
        if (at.distance < nearest.distance) nearest = { ...at, digit, segment };
      }
    }
    const { digit, segment, t } = nearest;
    const bone = 1 + digit * 3 + segment;
    let first = bone; let second = bone; let weight = 1;
    if (nearest.distance > palmDistance(point.x, point.y, point.z) + 1 || segment === 0 && t === 0) {
      first = 0; second = 0;
    } else if (segment === 0 && t < 0.35) {
      first = 0; second = bone; weight = 1 - THREE.MathUtils.smoothstep(t, 0, 0.35);
    } else if (segment > 0 && t < 0.22) {
      first = bone - 1; second = bone; weight = 0.5 * (1 - THREE.MathUtils.smoothstep(t, 0, 0.22));
    } else if (segment < 2 && t > 0.78) {
      second = bone + 1; weight = 1 - 0.5 * THREE.MathUtils.smoothstep(t, 0.78, 1);
    }
    indices.push(first, second, 0, 0); weights.push(weight, 1 - weight, 0, 0);
    const warmth = 0.025 * Math.sin(point.x * 0.047 + point.y * 0.06);
    colors.push(1, 0.96 + warmth, 0.91 + warmth);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function surfaceAt(x, y) {
  let rear = -40; let front = -7;
  for (let step = 0; step < 18; step++) {
    const middle = (rear + front) / 2;
    if (handDistance(x, y, middle) < 0) rear = middle;
    else front = middle;
  }
  return rear;
}

export function createHandReference({ resolution = 88 } = {}) {
  if (!Number.isInteger(resolution) || resolution < 32 || resolution > 144) throw new RangeError('Hand resolution must be an integer from 32 to 144.');
  const group = new THREE.Group();
  group.name = 'Articulated hand reference';
  const material = new THREE.MeshPhysicalMaterial({ color: 0xc68c6d, roughness: 0.8, metalness: 0, vertexColors: true, sheen: 0.18, sheenColor: new THREE.Color(0xe3ad91) });
  const geometry = skinGeometry(resolution);
  attachSkinWeights(geometry);
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'Continuous palm and articulated fingers';
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const palm = new THREE.Bone(); palm.name = 'Palm';
  const bones = [palm];
  const digitBones = [];
  for (const digit of DIGITS) {
    const chain = [];
    let previous = palm; let previousOrientation = new THREE.Quaternion();
    digit.lengths.forEach((length, index) => {
      const bone = new THREE.Bone();
      bone.name = `${digit.name} joint ${index + 1}`;
      if (index === 0) bone.position.set(...digit.root);
      else bone.position.set(0, digit.lengths[index - 1], 0);
      const global = orientation(digit, index, 0);
      bone.quaternion.copy(previousOrientation.clone().invert().multiply(global));
      previous.add(bone); chain.push(bone); bones.push(bone);
      previous = bone; previousOrientation = global;
    });
    digitBones.push(chain);
  }
  mesh.add(palm);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  group.add(mesh);

  const creaseMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5542, roughness: 1, transparent: true, opacity: 0.23, depthWrite: false });
  for (const coordinates of [
    [[-37, -15], [-22, -17], [-9, -11], [-1, 3], [-7, 18]],
    [[-21, -30], [-6, -23], [9, -17], [18, -6]],
    [[-14, 26], [-1, 20], [11, 16], [20, 17]],
    [[-60, -17], [-57, -29], [-51, -43]],
  ]) {
    const curve = new THREE.CatmullRomCurve3(coordinates.map(([x, y]) => new THREE.Vector3(x, y, surfaceAt(x, y) + 0.08)));
    const crease = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.14, 5, false), creaseMaterial);
    crease.name = 'Palm crease'; group.add(crease);
  }
  const nailMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe0af97, roughness: 0.5, clearcoat: 0.12 });
  DIGITS.forEach((digit, index) => {
    const end = digitBones[index][2];
    const radius = digit.radii[3];
    const nail = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), nailMaterial);
    nail.name = `${digit.name} nail`;
    nail.scale.set(radius * 0.68, radius * 0.96, 0.45);
    nail.position.set(0, digit.lengths[2] - 2.8, -radius + 0.25);
    end.add(nail);
    for (let joint = 1; joint < 3; joint++) {
      const crease = new THREE.Mesh(new THREE.TorusGeometry(digit.radii[joint] * 0.88, 0.12, 4, 16, Math.PI * 0.7), creaseMaterial);
      crease.name = `${digit.name} joint crease`;
      crease.rotation.set(Math.PI / 2, 0, Math.PI * 0.15);
      crease.position.y = 1;
      digitBones[index][joint].add(crease);
    }
  });

  let progress = 0; let elapsed = 0; let animating = false;
  function applyGrip(value) {
    progress = value;
    DIGITS.forEach((digit, digitIndex) => {
      let parentOrientation = new THREE.Quaternion();
      digitBones[digitIndex].forEach((bone, segment) => {
        const global = orientation(digit, segment, value);
        bone.quaternion.copy(parentOrientation.clone().invert().multiply(global));
        parentOrientation = global;
      });
    });
    group.updateMatrixWorld(true); skeleton.update();
  }
  function setGrip(value) {
    if (!Number.isFinite(value)) throw new TypeError('Grip progress must be finite.');
    animating = false;
    applyGrip(THREE.MathUtils.clamp(value, 0, 1));
  }
  const framingBox = new THREE.Box3();
  for (const value of [0, 0.5, 1]) {
    applyGrip(value); mesh.computeBoundingBox();
    framingBox.union(new THREE.Box3().setFromObject(group));
  }
  setGrip(0); mesh.boundingBox.copy(framingBox);
  const size = framingBox.getSize(new THREE.Vector3());
  return {
    group, framingBox, setGrip,
    replayGrip() { setGrip(0); elapsed = 0; animating = true; },
    update(deltaSeconds) {
      if (!animating) return false;
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new TypeError('Animation delta must be a nonnegative number.');
      elapsed = Math.min(1.6, elapsed + deltaSeconds);
      applyGrip(THREE.MathUtils.smootherstep(elapsed / 1.6, 0, 1));
      if (elapsed === 1.6) animating = false;
      return true;
    },
    get gripProgress() { return progress; },
    get isAnimating() { return animating; },
    getJointPositions() {
      return Object.fromEntries(DIGITS.map((digit, index) => [digit.name, [
        ...digitBones[index].map(bone => bone.getWorldPosition(new THREE.Vector3()).toArray()),
        digitBones[index][2].localToWorld(new THREE.Vector3(0, digit.lengths[2], 0)).toArray(),
      ]]));
    },
    placement: { spark: [0, 0, 0], reference: [44, -58, -3.9] },
    target: [0, -5, 0], extent: { width: size.x, height: size.y, depth: size.z },
    handLengthMm: 188, wristY: WRIST[1], wrist: WRIST,
    label: 'Illustrative 188 mm adult hand; grip motion is a visual study',
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8064611/',
  };
}
