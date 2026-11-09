import * as THREE from 'three';

const clamp = value => Math.min(1, Math.max(0, value));
const phase = (value, start, end) => clamp((value - start) / (end - start));

export function assemblyOffsets(value) {
  const progress = clamp(Number(value));
  const withdraw = phase(progress, 0.12, 0.62);
  const moveAside = phase(progress, 0.62, 0.82);
  const lift = phase(progress, 0.82, 1);
  return {
    sleeve: [-38 * moveAside, -118 * withdraw + 118 * lift, 0],
    display_lens_reference: [-38 * moveAside, -118 * withdraw + 118 * lift, 0],
    bottom_cap: [29 * phase(progress, 0.06, 0.12), -10 * phase(progress, 0, 0.06), 0],
    front_cover: [29 * phase(progress, 0.72, 1), 0, -14 * phase(progress, 0.62, 0.84)],
  };
}

export function createAssemblyView({ model, partIndex }) {
  model.updateMatrixWorld(true);
  const parts = partIndex.parts;
  const resources = new Set();
  const additions = [];
  const pickables = [];
  const snapshots = new Map();
  for (const name of Object.keys(assemblyOffsets(0))) {
    const part = parts.get(name);
    snapshots.set(name, {
      part,
      position: part.position.clone(),
      toLocal: part.parent.matrixWorld.clone().invert(),
    });
  }
  const bounds = name => new THREE.Box3().setFromObject(parts.get(name));
  const material = (color, metalness = 0, roughness = 0.5) => {
    const result = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    resources.add(result);
    return result;
  };
  const paint = (name, settings) => parts.get(name)?.traverse(object => {
    if (!object.isMesh || object.userData.visualDetail) return;
    for (const current of Array.isArray(object.material) ? object.material : [object.material]) {
      if (settings.color !== undefined) current.color.setHex(settings.color);
      for (const [key, value] of Object.entries(settings)) if (key !== 'color') current[key] = value;
      current.needsUpdate = true;
    }
  });
  const sleeveFinish = { color: 0x272d35, metalness: 0.72, roughness: 0.32 };
  paint('sleeve', sleeveFinish);
  paint('carrier', { color: sleeveFinish.color, metalness: 0.12, roughness: 0.42 });
  paint('front_cover', { color: 0x252b2f, metalness: 0, roughness: 0.77 });
  paint('bottom_cap', sleeveFinish);
  paint('pcb_reference', { color: 0x124936, metalness: 0.08, roughness: 0.46 });
  paint('battery_reference', { color: 0xb2b6b9, metalness: 0.78, roughness: 0.34 });
  paint('inductor_reference', { color: 0x292d31, metalness: 0.12, roughness: 0.7 });
  paint('u1_reference', { color: 0x14181b, metalness: 0.03, roughness: 0.7 });
  paint('usb_reference', { color: 0x969fa7, metalness: 0.93, roughness: 0.2 });
  paint('a30_unmeasured_reference', { color: 0xd26d25, metalness: 0, roughness: 0.58 });
  paint('display_glass_reference', { color: 0x070a0e, metalness: 0.12, roughness: 0.2 });
  paint('display_lens_reference', {
    color: 0x17232e, metalness: 0.08, roughness: 0.16,
    transparent: true, opacity: 0.1, depthWrite: false,
  });
  for (const name of parts.keys()) {
    if (name.endsWith('pad_reference')) paint(name, { color: 0xbba259, metalness: 0.86, roughness: 0.25 });
    if (/^c\d+_/.test(name) || name === 'input_cap_reference') paint(name, { color: 0x82694d, metalness: 0.02, roughness: 0.65 });
    if (/^r\d+_/.test(name)) paint(name, { color: 0x171b21, metalness: 0, roughness: 0.65 });
  }
  const keepout = parts.get('display_fpc_keepout_reference');
  const originalKeepoutVisibility = keepout.visible;
  keepout.visible = false;

  function attach(name, geometry, meshMaterial, position, rotation) {
    resources.add(geometry);
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.name = name;
    mesh.position.copy(position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.visualDetail = true;
    parts.get(name).attach(mesh);
    additions.push(mesh);
    pickables.push(mesh);
    return mesh;
  }
  const box = (name, size, position, meshMaterial) => attach(name, new THREE.BoxGeometry(...size), meshMaterial, position);
  const silver = material(0xb9c0c7, 0.9, 0.25);
  const gold = material(0xc4a352, 0.88, 0.3);
  const dark = material(0x101419, 0.12, 0.7);
  const foil = material(0x999fa5, 0.85, 0.38);
  const maskTrace = material(0x206247, 0.18, 0.43);
  const board = bounds('pcb_reference');
  const boardPoint = (x, y, back = false, gap = 0.035) => new THREE.Vector3(
    board.min.x + x, board.min.y + y, back ? board.max.z + gap : board.min.z - gap,
  );

  function label(name, text, width, height, position, back = false, background = null, ink = '#e2e4da') {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) return;
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    const lines = text.split('\n');
    context.fillStyle = background ? '#20252a' : ink;
    context.font = `600 ${lines.length > 2 ? 42 : 58}px monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    lines.forEach((line, i) => context.fillText(line, 256, 128 + (i - (lines.length - 1) / 2) * 62));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    resources.add(texture);
    const textMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    resources.add(textMaterial);
    const mesh = attach(name, new THREE.PlaneGeometry(width, height), textMaterial, position, back ? undefined : [0, Math.PI, 0]);
    mesh.castShadow = false;
  }

  const tracks = [
    [false, 0.4, [[10, 16.25], [10, 17.8]]],
    [false, 0.8, [[10, 17.8], [10, 18.6]]],
    [false, 2, [[10, 18.6], [10, 20.675]]],
    [false, 0.18, [[10.25, 14.825], [10.25, 15.5], [10, 15.75], [10, 16.25]]],
    [false, 0.18, [[11.2, 13.3], [10.25, 13.3], [10.25, 14.825]]],
    [false, 0.18, [[10.75, 14.825], [10.75, 14], [12.2, 14], [12.2, 13.3]]],
    [false, 0.18, [[9.25, 14.825], [9.25, 13.3], [8.1, 13.3]]],
    [false, 0.15, [[8.5875, 15.125], [5.5, 15.125], [5.5, 12], [4.5, 11]]],
    [false, 0.15, [[5.5, 17], [6.5, 17], [6.5, 15.125]]],
    [false, 0.15, [[4.5, 17], [4.5, 18], [1.8, 18], [1.8, 17]]],
    [false, 0.15, [[11.425, 15.625], [14.9, 15.625], [17, 17.725], [17, 24]]],
    [true, 0.15, [[7.3, 16.3], [8, 17], [8, 22]]],
    [true, 0.15, [[8, 20], [6, 20]]],
    [true, 0.15, [[5, 20], [4.5, 20.5], [4.5, 22], [3, 22]]],
  ];
  for (const [back, width, points] of tracks) {
    for (let i = 1; i < points.length; i++) {
      const from = boardPoint(...points[i - 1], back);
      const to = boardPoint(...points[i], back);
      const middle = from.clone().add(to).multiplyScalar(0.5);
      const segment = box('pcb_reference', [from.distanceTo(to), width, 0.025], middle, maskTrace);
      const worldRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(to.y - from.y, to.x - from.x));
      const ownerRotation = parts.get('pcb_reference').getWorldQuaternion(new THREE.Quaternion()).invert();
      segment.quaternion.copy(ownerRotation.multiply(worldRotation));
    }
  }
  for (const [x, y] of [[1, 1], [19, 1], [1, 37], [19, 37], [1, 29], [18, 30], [8.1, 16.2], [8.8, 17.7], [12.4, 16.2], [13, 16.2], [13.5, 16.2]]) {
    for (const back of [false, true]) {
      attach('pcb_reference', new THREE.RingGeometry(0.1, 0.24, 12), gold, boardPoint(x, y, back, 0.055), back ? undefined : [0, Math.PI, 0]);
      attach('pcb_reference', new THREE.CircleGeometry(0.095, 12), dark, boardPoint(x, y, back, 0.06), back ? undefined : [0, Math.PI, 0]);
    }
  }
  label('pcb_reference', 'SPARK A\nBENCH ONLY', 9, 3.1, boardPoint(8, 5.6), false);
  label('pcb_reference', 'VIN+       GND', 15, 1.5, boardPoint(10, 0.7), false);
  label('pcb_reference', '5V / 9V', 6, 1.4, boardPoint(14.2, 37.2), false);
  const inductor = bounds('inductor_reference');
  label('inductor_reference', '2.2 uH', 8, 3.2, new THREE.Vector3(0, (inductor.min.y + inductor.max.y) / 2, inductor.min.z - 0.035));
  const controller = bounds('u1_reference');
  label('u1_reference', '61288', 2.5, 1.1, new THREE.Vector3(0, (controller.min.y + controller.max.y) / 2, controller.min.z - 0.025));

  for (const [name] of parts) {
    if (!/^([cr]\d+_|input_cap_)/.test(name)) continue;
    const body = bounds(name);
    const size = body.getSize(new THREE.Vector3());
    const middle = body.getCenter(new THREE.Vector3());
    const alongX = size.x > size.y;
    const length = alongX ? size.x : size.y;
    const band = Math.min(0.35, length * 0.19);
    for (const side of [-1, 1]) {
      const position = middle.clone();
      position[alongX ? 'x' : 'y'] += side * (length - band) / 2;
      box(name, [alongX ? band : size.x + 0.035, alongX ? size.y + 0.035 : band, size.z + 0.04], position, silver);
    }
  }

  const battery = bounds('battery_reference');
  const batteryCenter = battery.getCenter(new THREE.Vector3());
  for (const side of [-1, 1]) {
    box('battery_reference', [0.48, 63.6, 0.12], new THREE.Vector3(batteryCenter.x + side * 8.6, batteryCenter.y, battery.min.z - 0.045), foil);
    box('battery_reference', [16.6, 0.65, 0.1], new THREE.Vector3(batteryCenter.x, batteryCenter.y + side * 32.3, battery.min.z - 0.055), foil);
  }
  label('battery_reference', '850 mAh\n1S  3.8 V\nLiHV', 14, 23, new THREE.Vector3(batteryCenter.x, batteryCenter.y + 5, battery.min.z - 0.13), false, '#d8dcde');
  const tape = material(0x9a692e, 0.18, 0.48);
  box('battery_reference', [11.8, 1.4, 0.18], new THREE.Vector3(0, battery.max.y - 0.9, battery.min.z - 0.09), tape);

  function wire(name, points, color, radius = 0.44) {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    const mesh = attach(name, new THREE.TubeGeometry(curve, 28, radius, 8, false), material(color, 0, 0.7), new THREE.Vector3());
    mesh.userData.illustrativeRouting = true;
  }
  const connector = bounds('a30_unmeasured_reference');
  for (const [side, color] of [[-1, 0xad2d28], [1, 0x1b2027]]) {
    wire('battery_reference', [
      [side * 2.8, battery.max.y - 0.2, -2.4],
      [side * 2.7, battery.max.y + 0.9, -2.4],
      [side * 1.3, connector.min.y - 0.55, -2.4],
      [side * 1.3, connector.min.y + 0.1, -2.4],
    ], color);
    wire('a30_unmeasured_reference', [
      [side * 1.3, connector.max.y - 0.1, -2.5],
      [side * 3.9, connector.max.y + 0.65, -2.5],
      [side * 5, board.min.y + 5.8, -1.3],
      [side * 5, board.min.y + 3, board.min.z - 0.13],
    ], color);
  }
  const flex = material(0x9d6428, 0.2, 0.48);
  const glass = bounds('display_glass_reference');
  box('display_glass_reference', [10, 4.4, 0.12], new THREE.Vector3(0, glass.max.y + 2.2, 4.05), flex).userData.illustrativeRouting = true;
  for (let i = 0; i < 20; i++) {
    box('display_glass_reference', [0.16, 3.9, 0.025], new THREE.Vector3(-4.75 + i * 0.5, glass.max.y + 2.2, 4.13), gold).userData.illustrativeRouting = true;
  }

  const cap = bounds('bottom_cap');
  for (const x of [-6, 6]) {
    attach('bottom_cap', new THREE.CylinderGeometry(1.9, 1.9, 2, 24), silver, new THREE.Vector3(x, cap.min.y + 1.2, 0));
    attach('bottom_cap', new THREE.CylinderGeometry(0.95, 0.95, 3, 16), silver, new THREE.Vector3(x, cap.min.y + 3.7, 0));
    attach('bottom_cap', new THREE.CylinderGeometry(0.85, 0.85, 0.04, 6), dark, new THREE.Vector3(x, cap.min.y + 0.18, 0));
    for (let i = 0; i < 6; i++) {
      attach('bottom_cap', new THREE.TorusGeometry(0.94, 0.055, 4, 16), silver,
        new THREE.Vector3(x, cap.min.y + 2.7 + i * 0.4, 0), [Math.PI / 2, 0, 0]);
    }
  }

  const activeBounds = bounds('display_active_reference');
  const lensBounds = bounds('display_lens_reference');
  const finishPosition = lensBounds.getCenter(new THREE.Vector3());
  finishPosition.z = lensBounds.max.z + 0.003;
  // Preview a colour-matched transmissive coating across the existing sleeve recess.
  const displayFinish = attach('sleeve', new THREE.PlaneGeometry(17.2, 19.7),
    material(sleeveFinish.color, sleeveFinish.metalness, sleeveFinish.roughness), finishPosition);
  displayFinish.castShadow = false;
  displayFinish.receiveShadow = false;
  displayFinish.userData.partName = 'display_lens_reference';
  displayFinish.userData.appearanceStudy = true;
  const sleeveBounds = bounds('sleeve');
  label('sleeve', 'S P A R K', 10, 3.2,
    new THREE.Vector3(0, sleeveBounds.min.y + 13, sleeveBounds.max.z + 0.018), true, null, '#777b80');
  function setFinish(name) {
    const colors = { graphite: 0x272d35, titanium: 0x92908b };
    if (!(name in colors)) return false;
    const finish = { ...sleeveFinish, color: colors[name] };
    for (const part of ['sleeve', 'bottom_cap']) paint(part, finish);
    paint('carrier', { color: finish.color, metalness: 0.12, roughness: 0.42 });
    displayFinish.material.color.setHex(sleeveFinish.color);
    return true;
  }
  let progress = 0;
  function setOpen(value) {
    progress = clamp(Number(value));
    displayFinish.visible = progress === 0;
    parts.get('display_lens_reference').visible = progress > 0;
    for (const [name, delta] of Object.entries(assemblyOffsets(progress))) {
      const { part, position, toLocal } = snapshots.get(name);
      const origin = new THREE.Vector3().applyMatrix4(toLocal);
      const localDelta = new THREE.Vector3(...delta).applyMatrix4(toLocal).sub(origin);
      part.position.copy(position).add(localDelta);
    }
    model.updateMatrixWorld(true);
  }
  setOpen(0);
  return {
    group: model,
    pickables,
    screenPresentation: {
      part: parts.get('display_active_reference'),
      widthMm: activeBounds.max.x - activeBounds.min.x,
      heightMm: activeBounds.max.y - activeBounds.min.y,
      center: activeBounds.getCenter(new THREE.Vector3()),
      z: activeBounds.max.z + 0.015,
      exterior: { part: displayFinish, z: finishPosition.z + 0.003 },
    },
    setOpen,
    setFinish,
    reset() { setOpen(0); },
    get isOpen() { return progress > 0; },
    get progress() { return progress; },
    dispose() {
      setOpen(0);
      parts.get('display_lens_reference').visible = true;
      keepout.visible = originalKeepoutVisibility;
      for (const item of additions) item.removeFromParent();
      for (const resource of resources) resource.dispose();
    },
  };
}
