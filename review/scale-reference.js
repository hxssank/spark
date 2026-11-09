import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function label(text, width = 28, height = 8) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.font = '500 40px sans-serif';
  context.fillStyle = '#425044';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, toneMapped: false }));
  sprite.scale.set(width, height, 1);
  return sprite;
}

export function createScaleReference(scene, groundY, initialDimensions) {
  const gridGroup = new THREE.Group();
  scene.add(gridGroup);
  const backdrop = new THREE.Group();
  const gridPoints = [];
  for (let x = -40; x <= 80; x += 10) gridPoints.push(new THREE.Vector3(x, groundY, 0), new THREE.Vector3(x, groundY + 140, 0));
  for (let y = 0; y <= 140; y += 10) gridPoints.push(new THREE.Vector3(-40, groundY + y, 0), new THREE.Vector3(80, groundY + y, 0));
  backdrop.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(gridPoints),
    new THREE.LineBasicMaterial({ color: 0xa5b4a1, transparent: true, opacity: 0.45 }),
  ));
  gridGroup.add(backdrop);

  const rulerPoints = [new THREE.Vector3(-20, groundY, 0), new THREE.Vector3(-20, groundY + 120, 0)];
  for (let y = 0; y <= 120; y += 10) {
    rulerPoints.push(new THREE.Vector3(-20, groundY + y, 0), new THREE.Vector3(-22, groundY + y, 0));
    if (y % 20 === 0) {
      const tick = label(String(y), 18, 7);
      tick.position.set(-29, groundY + y, 0);
      gridGroup.add(tick);
    }
  }
  gridGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rulerPoints), new THREE.LineBasicMaterial({ color: 0x62715d })));
  const sparkLabel = label('Spark');
  sparkLabel.position.set(0, groundY + 124, 0);
  gridGroup.add(sparkLabel);
  const reference = new THREE.Group();
  reference.position.set(44, groundY, 0);
  scene.add(reference);
  const nameLabel = label('JUUL2 form', 34, 8);
  const approximateLabel = label('Approximate', 34, 7);
  gridGroup.add(nameLabel, approximateLabel);
  const floorGrid = new THREE.GridHelper(240, 24, 0xa0af9c, 0xc4cec0);
  floorGrid.position.y = groundY - 0.3;
  gridGroup.add(floorGrid);

  function setDimensions({ length, width, thickness }) {
    while (reference.children.length) {
      const part = reference.children[0];
      reference.remove(part);
      part.geometry.dispose();
      part.material.dispose();
    }
    const podLength = length * 0.28;
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(width, length - podLength, thickness, 3, 1),
      new THREE.MeshStandardMaterial({ color: 0x72787b, metalness: 0.3, roughness: 0.6 }),
    );
    body.position.y = (length - podLength) / 2;
    const pod = new THREE.Mesh(
      new RoundedBoxGeometry(width, podLength, thickness, 3, 1),
      new THREE.MeshStandardMaterial({ color: 0x282d32, metalness: 0, roughness: 0.4 }),
    );
    pod.position.y = length - podLength / 2;
    for (const part of [body, pod]) { part.castShadow = true; part.receiveShadow = true; }
    reference.add(body, pod);
    nameLabel.position.set(44, groundY + length + 12, 0);
    approximateLabel.position.set(44, groundY + length + 6, 0);
  }
  setDimensions(initialDimensions);
  return {
    setDimensions,
    reference,
    gridGroup,
    setMode(mode) {
      gridGroup.visible = mode === 'scale';
      reference.visible = mode !== 'hidden';
      reference.position.set(44, groundY, 0);
    },
    update(camera) { backdrop.position.z = camera.position.z > 0 ? -18 : 18; },
  };
}
