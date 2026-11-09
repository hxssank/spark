import * as THREE from 'three';

export function handleViewerShortcut(event, actions, beforeAction = () => {}) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing
      || !Object.hasOwn(actions, event.key)) return false;
  event.preventDefault();
  if (event.repeat && event.key === ' ') return true;
  beforeAction(event.key);
  actions[event.key]();
  return true;
}

export function highlightPart(part, color = 0x193023) {
  const saved = [];
  const seen = new Set();
  part.traverse(object => {
    if (object.userData.visualDetail) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material?.emissive || seen.has(material)) continue;
      seen.add(material);
      saved.push([material, material.emissive.clone()]);
      material.emissive.setHex(color);
    }
  });
  return saved;
}

export function restoreHighlight(saved) {
  for (const [material, emissive] of saved) material.emissive.copy(emissive);
}

export function stepOrbit(controls, degrees) {
  const camera = controls.object;
  const target = controls.target.clone();
  const offset = camera.position.clone().sub(target);
  const desiredYaw = Math.atan2(offset.x, offset.z) + THREE.MathUtils.degToRad(degrees);
  const horizontalDistance = Math.hypot(offset.x, offset.z);
  const damping = controls.enableDamping;
  const autoRotate = controls.autoRotate;
  controls.enableDamping = false;
  controls.autoRotate = false;
  try {
    controls.update(0);
    controls.target.copy(target);
    camera.position.set(
      target.x + Math.sin(desiredYaw) * horizontalDistance,
      target.y + offset.y,
      target.z + Math.cos(desiredYaw) * horizontalDistance,
    );
    controls.update(0);
  } finally {
    controls.enableDamping = damping;
    controls.autoRotate = autoRotate;
  }
}

export function createMotionState({ reducedMotion = false } = {}) {
  let active = !reducedMotion;
  return {
    get active() { return active; },
    pause() { active = false; },
    play() { active = true; },
    setReducedMotion(value) { if (value) active = false; },
  };
}
