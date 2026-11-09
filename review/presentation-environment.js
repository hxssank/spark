import * as THREE from 'three';
import { createStudyEnvironment } from './study-environment.js';

export function createPresentationEnvironment(scene, { floorY = -58.5 } = {}) {
  const studio = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.ShadowMaterial({ color: 0x454947, opacity: 0.16 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  studio.add(floor);
  studio.position.y = floorY;
  scene.add(studio);
  let study;
  let mode = 'studio';
  let motion = false;
  return {
    setMode(value) {
      mode = value === 'desk' ? 'desk' : 'studio';
      if (mode === 'desk' && !study) study = createStudyEnvironment(scene, { floorY });
      studio.visible = mode === 'studio';
      study?.setVisible(mode === 'desk');
      study?.setMotionEnabled(motion);
    },
    setFloorY(value) {
      floorY = value;
      studio.position.y = value;
      study?.setFloorY(value);
    },
    setMotionEnabled(value) {
      motion = value;
      study?.setMotionEnabled(value);
    },
    update(delta) { return mode === 'desk' && study ? study.update(delta) : false; },
  };
}
