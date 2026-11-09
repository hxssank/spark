import * as THREE from 'three';

function oakTexture() {
  const width = 512, height = 128;
  const data = new Uint8Array(width * height * 4);
  let seed = 141;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const grain = Math.sin(y * 0.84 + Math.sin(x / 71) * 2.8 + Math.sin(x / 19) * 0.2);
      const pores = Math.pow(Math.max(0, grain), 12) * 21;
      const bands = Math.sin(y / 14 + Math.sin(x / 130)) * 9;
      const tone = bands - pores + (seed / 0xffffffff - 0.5) * 8;
      const offset = (y * width + x) * 4;
      data[offset] = 99 + tone;
      data[offset + 1] = 60 + tone * 0.72;
      data[offset + 2] = 30 + tone * 0.43;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createStudyEnvironment(scene, { floorY = -58 } = {}) {
  const group = new THREE.Group();
  group.name = 'Oak study';
  group.position.y = floorY;
  scene.add(group);
  scene.background = new THREE.Color(0x211c18);
  scene.fog = new THREE.Fog(0x211c18, 600, 1600);
  const oak = new THREE.MeshStandardMaterial({ map: oakTexture(), roughness: 0.36, metalness: 0.03 });
  const darkOak = new THREE.MeshStandardMaterial({ color: 0x332016, roughness: 0.5 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb39554, roughness: 0.3, metalness: 0.78 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x28332d, roughness: 0.82 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x3b4034, roughness: 0.95 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x8c8270, roughness: 0.82 });
  const black = new THREE.MeshStandardMaterial({ color: 0x171311, roughness: 0.95 });

  function mesh(geometry, material, x, y, z, name = '') {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z);
    item.name = name;
    item.castShadow = true;
    item.receiveShadow = true;
    group.add(item);
    return item;
  }
  function box(w, h, d, material, x, y, z, name) {
    return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, name);
  }
  function cylinder(radius, height, material, x, y, z, name) {
    return mesh(new THREE.CylinderGeometry(radius, radius, height, 32), material, x, y, z, name);
  }
  function rod(start, end, radius, material) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const item = cylinder(radius, a.distanceTo(b), material, 0, 0, 0);
    item.position.copy(a).add(b).multiplyScalar(0.5);
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    return item;
  }

  box(1200, 30, 840, oak, 0, -16, -120, 'Solid oak desktop');
  box(1212, 8, 852, darkOak, 0, -30, -120, 'Moulded desk edge');
  for (const z of [-470, -260, -50, 160]) box(1198, 0.12, 0.7, darkOak, 0, -0.94, z);
  box(222, 0.8, 158, leather, 12, -0.5, 6, 'Green leather writing pad');
  for (const z of [-72, 84]) box(220, 0.1, 0.45, brass, 12, -0.03, z);
  for (const x of [-97, 121]) box(0.45, 0.1, 155, brass, x, -0.03, 6);
  box(1100, 84, 36, darkOak, 0, -76, 250);
  for (const x of [-360, 0, 360]) {
    box(335, 63, 8, oak, x, -72, 271);
    rod([x - 25, -72, 280], [x + 25, -72, 280], 2.4, brass);
  }
  for (const x of [-510, 510]) for (const z of [-430, 240]) {
    box(55, 530, 55, darkOak, x, -305, z);
  }

  box(1500, 850, 22, wall, 0, 140, -540, 'Study wall');
  box(1500, 210, 16, darkOak, 0, -150, -520);
  for (let x = -700; x <= 700; x += 140) {
    box(7, 210, 12, oak, x, -150, -507);
    box(125, 5, 12, oak, x + 68, -51, -507);
  }
  for (const x of [-750, 750]) box(20, 850, 1500, wall, x, 140, 100);
  box(1500, 850, 20, wall, 0, 140, 800);

  const fireX = -80, fireZ = -470;
  box(270, 230, 38, stone, fireX, 100, fireZ, 'Limestone fireplace');
  box(185, 170, 40, black, fireX, 76, fireZ + 22, 'Firebox');
  box(310, 20, 75, stone, fireX, 220, fireZ + 10, 'Carved mantel');
  box(292, 9, 65, darkOak, fireX, 234, fireZ + 10);
  box(285, 12, 90, stone, fireX, -15, fireZ + 25);
  for (const x of [fireX - 112, fireX + 112]) {
    box(28, 194, 25, stone, x, 101, fireZ + 30);
    for (const y of [27, 78, 129, 180]) box(27, 1, 0.5, darkOak, x, y, fireZ + 43);
  }
  for (const x of [-45, 0, 42]) {
    const log = cylinder(9, 112, black, fireX + x, 12, fireZ + 48);
    log.rotation.z = Math.PI / 2 + x / 260;
    log.rotation.y = x / 250;
  }
  const flames = [];
  for (let i = 0; i < 7; i++) {
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, seed: { value: i * 2.13 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec2 vUv; uniform float time; uniform float seed;
        void main(){
          float y=vUv.y;
          float drift=sin(y*9.0-time*2.8+seed)*0.08*y+sin(y*17.0-time*4.0)*0.035*y;
          float x=abs(vUv.x-0.5+drift);
          float width=(0.34*(1.0-y)+0.07*sin(y*6.0))*pow(1.0-y,0.35);
          float glow=1.0-smoothstep(width*0.3,width+0.1,x);
          float alpha=glow*smoothstep(0.0,0.12,y)*(1.0-smoothstep(0.72,1.0,y));
          vec3 color=mix(vec3(1.0,0.22,0.025),vec3(1.0,0.78,0.22),glow*(1.0-y));
          gl_FragColor=vec4(color,alpha*0.76);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const height = 32 + ((i * 17) % 43);
    const flame = mesh(new THREE.PlaneGeometry(2, 2), material,
      fireX - 58 + i * 19, 22 + height / 2, fireZ + 55, 'Firelight');
    flame.scale.set(20 + i % 3, height / 2, 1);
    flame.userData.restScale = flame.scale.clone();
    flame.castShadow = false;
    flames.push(flame);
  }
  const firelight = new THREE.PointLight(0xffa04b, 9500, 700, 2);
  firelight.position.set(fireX, 60, fireZ + 95);
  group.add(firelight);

  const lampX = -105, lampZ = -68;
  cylinder(37, 8, brass, lampX, 4, lampZ, 'Lamp base');
  cylinder(30, 5, darkOak, lampX, 9, lampZ);
  rod([lampX, 10, lampZ], [lampX, 100, lampZ], 3, brass);
  rod([lampX, 100, lampZ], [lampX + 30, 119, lampZ + 20], 3, brass);
  const shade = mesh(new THREE.SphereGeometry(1, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x214e35, roughness: 0.22, metalness: 0.1, side: THREE.DoubleSide }),
    lampX + 30, 115, lampZ + 20, 'Green glass banker lamp');
  shade.scale.set(43, 22, 24);
  const rim = mesh(new THREE.TorusGeometry(1, 0.025, 8, 48), brass,
    lampX + 30, 115, lampZ + 20);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(43, 24, 22);
  const bulb = mesh(new THREE.SphereGeometry(8, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe5a4 }), lampX + 30, 112, lampZ + 20);
  bulb.castShadow = false;
  const lamp = new THREE.PointLight(0xffdb9a, 8500, 550, 2);
  lamp.position.set(lampX + 30, 107, lampZ + 20);
  group.add(lamp);

  const bookColors = [0x49322c, 0x314338, 0x665138, 0x362e29];
  for (let i = 0; i < 3; i++) {
    box(100 - i * 7, 14, 72, new THREE.MeshStandardMaterial({ color: bookColors[i], roughness: 0.8 }),
      215 + i * 3, 7 + i * 15, -155);
    box(93 - i * 7, 10, 69, new THREE.MeshStandardMaterial({ color: 0xb8a786, roughness: 0.9 }),
      215 + i * 3, 7 + i * 15, -153);
  }
  box(184, 380, 48, darkOak, -327, 175, -478, 'Oak bookcase');
  for (let row = 0; row < 4; row++) {
    box(172, 8, 60, oak, -327, 12 + row * 88, -455);
    for (let column = 0; column < 9; column++) {
      const height = 52 + ((column * 13 + row * 7) % 23);
      const x = -402 + column * 18;
      const material = new THREE.MeshStandardMaterial({ color: bookColors[(column + row) % 4], roughness: 0.8 });
      box(14, height, 26, material, x, 18 + row * 88 + height / 2, -444);
      for (const offset of [8, height - 8]) box(13, 1.2, 0.4, brass, x, 18 + row * 88 + offset, -430.7);
    }
  }

  let motion = true, elapsed = 0;
  group.traverse(object => {
    if (object.material && 'envMapIntensity' in object.material) object.material.envMapIntensity = 0.4;
    if (object.position.z < -300) object.castShadow = false;
  });
  return {
    group,
    setFloorY(y) { group.position.y = y; },
    setVisible(visible) { group.visible = visible; },
    setMotionEnabled(enabled) { motion = enabled; },
    update(delta) {
      if (!motion || !group.visible || delta <= 0) return false;
      elapsed += Math.min(delta, 0.05);
      flames.forEach((flame, i) => {
        const pulse = 0.92 + Math.sin(elapsed * (3.1 + i * 0.17) + i * 1.8) * 0.08;
        flame.scale.copy(flame.userData.restScale);
        flame.scale.y *= pulse;
        flame.rotation.z = Math.sin(elapsed * 1.9 + i) * 0.12;
        flame.material.uniforms.time.value = elapsed;
      });
      firelight.intensity = 9500 * (1 + Math.sin(elapsed * 3.7) * 0.035);
      return true;
    },
  };
}
