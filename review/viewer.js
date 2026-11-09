import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPresentationEnvironment } from './presentation-environment.js';
import { createRenderScheduler } from './render-scheduler.mjs';
import { drawDisplay } from './display-screen.mjs';
import { createScaleReference } from './scale-reference.js';
import { indexAssemblyParts } from './assembly-parts.mjs';
import { createHandReference } from './hand-reference.js';
import { createAssemblyView } from './assembly-view.js';
import { partCatalog } from './part-catalog.mjs';
import { createMotionState, handleViewerShortcut, highlightPart, restoreHighlight, stepOrbit } from './viewer-interactions.mjs';
import contract from '../mechanical/mechanical-contract.json';

const viewport = document.getElementById('viewport');
const status = document.getElementById('model-status');
const viewButtons = [...document.querySelectorAll('[data-view]')];
const motionButton = document.getElementById('motion-toggle');
const replayButton = document.getElementById('replay-grip');
const screenDemoButton = document.getElementById('screen-demo');
const finishButtons = [...document.querySelectorAll('[data-finish]')];
const sceneSelect = document.getElementById('scene-select');
const displayCanvas = document.createElement('canvas');
drawDisplay(displayCanvas);
const selection = document.getElementById('selection');
const selectionLink = document.getElementById('selection-link');
const referenceDimensions = { length: 97, width: 16, thickness: 7 };
const views = { overview: 'Overview', size: 'Size comparison', hand: 'In hand', open: 'Open case', screen: 'Screen' };
let stopRendering = () => {};

function showError(error) {
  stopRendering();
  status.textContent = '3D view unavailable';
  viewport.classList.add('failed');
  document.getElementById('loading').hidden = true;
  document.getElementById('viewer-error').hidden = false;
  for (const control of [...viewButtons, ...finishButtons, sceneSelect, motionButton, replayButton, screenDemoButton]) control.disabled = true;
  console.error(error);
}
document.getElementById('retry-viewer').addEventListener('click', () => location.reload());

try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xf1f2ec, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Interactive Spark 3D model');
  renderer.domElement.setAttribute('aria-describedby', 'viewer-help');
  renderer.domElement.tabIndex = 0;
  viewport.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion = createMotionState({ reducedMotion: reducedMotion.matches });
  motion.pause();
  controls.enableDamping = !reducedMotion.matches;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.autoRotateSpeed = 0.5;
  controls.minDistance = 35;
  controls.maxDistance = 1000;
  controls.minPolarAngle = 0.06;
  controls.maxPolarAngle = Math.PI - 0.06;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;

  let model, partIndex, assemblyView, hand, scaleReference;
  const environment = createPresentationEnvironment(scene, { floorY: -contract.dimensions.length / 2 - 0.5 });
  let modelBase;
  let currentView = 'overview';
  let selectedMaterials = [];
  let displayTexture, screenMesh;
  let displaySimulated = false;
  let renderCount = 0;
  let shadowPassCount = 0;
  let inView = true;
  let failed = false;
  const pickables = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down;

  const scheduler = createRenderScheduler({
    requestFrame: callback => requestAnimationFrame(callback),
    cancelFrame: id => cancelAnimationFrame(id),
    onError: showError,
    draw: delta => {
      controls.autoRotate = motion.active && Boolean(model);
      const changed = controls.update(delta);
      const handWasAnimating = currentView === 'hand' && motion.active && hand?.isAnimating;
      const handMoving = handWasAnimating && hand.update(delta);
      if (handWasAnimating) renderer.shadowMap.needsUpdate = true;
      const environmentMoving = environment.update(motion.active ? delta : 0);
      scaleReference?.update(camera);
      if (renderer.shadowMap.needsUpdate) shadowPassCount++;
      renderer.render(scene, camera);
      renderer.domElement.dataset.shadowPassCount = String(shadowPassCount);
      renderer.domElement.dataset.renderCount = String(++renderCount);
      renderer.domElement.dataset.motion = motion.active ? 'playing' : 'paused';
      renderer.domElement.dataset.angle = String(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()));
      if (hand) renderer.domElement.dataset.gripProgress = String(hand.gripProgress);
      return changed || controls.autoRotate || handMoving || environmentMoving;
    },
  });
  function updateMotion() {
    controls.autoRotate = motion.active && Boolean(model);
    environment.setMotionEnabled(motion.active);
    if (!motion.active) stepOrbit(controls, 0);
    motionButton.textContent = motion.active ? 'Pause motion' : 'Resume motion';
    motionButton.setAttribute('aria-label', motion.active ? 'Pause automatic rotation and scene motion' : 'Resume automatic rotation and scene motion');
    scheduler.request();
  }
  function pauseMotion() {
    motion.pause();
    updateMotion();
  }
  motionButton.addEventListener('click', () => {
    if (motion.active) motion.pause();
    else motion.play();
    updateMotion();
  });
  screenDemoButton.addEventListener('click', () => {
    displaySimulated = !displaySimulated;
    screenDemoButton.setAttribute('aria-pressed', String(displaySimulated));
    screenDemoButton.textContent = displaySimulated ? 'Clear screen demo' : 'Show screen demo';
    drawDisplay(displayCanvas, displaySimulated, 'charge');
    if (displayTexture) displayTexture.needsUpdate = true;
    scheduler.request();
  });
  replayButton.addEventListener('click', () => {
    if (!hand || currentView !== 'hand') return;
    motion.play();
    hand.replayGrip();
    updateMotion();
  });
  for (const button of finishButtons) button.addEventListener('click', () => {
    if (!assemblyView?.setFinish(button.dataset.finish)) return;
    for (const item of finishButtons) item.setAttribute('aria-pressed', String(item === button));
    renderer.domElement.dataset.finish = button.dataset.finish;
    scheduler.request();
  });
  sceneSelect.addEventListener('change', () => {
    environment.setMode(sceneSelect.value);
    renderer.shadowMap.needsUpdate = true;
    scheduler.request();
  });
  controls.addEventListener('start', pauseMotion);
  updateMotion();
  const updateVisibility = () => scheduler.setActive(!failed && inView && !document.hidden);
  stopRendering = () => { failed = true; controls.enabled = false; scheduler.setActive(false); };
  controls.addEventListener('change', scheduler.request);
  document.addEventListener('visibilitychange', updateVisibility);
  new IntersectionObserver(entries => { inView = entries[0].isIntersecting; updateVisibility(); }).observe(viewport);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); showError(new Error('WebGL context lost')); });
  reducedMotion.addEventListener('change', () => {
    controls.enableDamping = !reducedMotion.matches;
    motion.setReducedMotion(reducedMotion.matches);
    if (reducedMotion.matches && hand) {
      hand.setGrip(1);
      renderer.shadowMap.needsUpdate = true;
    }
    updateMotion();
  });

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.05).texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777c72, 1.6));
  const key = new THREE.DirectionalLight(0xfff5e7, 3.5);
  key.position.set(-100, 180, 160);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -220, right: 220, top: 190, bottom: -230, near: 1, far: 650 });
  key.shadow.normalBias = 0.12;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe2ebff, 1.6);
  fill.position.set(120, 45, -100);
  scene.add(fill);

  function clearSelection() {
    restoreHighlight(selectedMaterials);
    selectedMaterials = [];
    selection.hidden = true;
  }
  function ownerName(object) {
    return object.userData.partName || partIndex.ownerName(object);
  }
  function select(mesh) {
    clearSelection();
    if (mesh) {
      const name = ownerName(mesh);
      const data = partCatalog[name];
      const part = partIndex.parts.get(name);
      if (data && part) {
        selectedMaterials = highlightPart(part);
        selectionLink.textContent = `${data.label} · details →`;
        selectionLink.href = `parts.html#${data.detailId || name}`;
        selection.hidden = false;
      }
    }
    scheduler.request();
  }

  function resize() {
    const { width, height } = viewport.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height));
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    camera.updateProjectionMatrix();
    scheduler.request();
  }
  new ResizeObserver(resize).observe(viewport);
  resize();

  function positionCamera(box, direction) {
    controls.autoRotate = false;
    controls.enableDamping = false;
    controls.update();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    const radius = size.length() / 2;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const limitingFov = camera.aspect < 1 ? 2 * Math.atan(Math.tan(fov / 2) * camera.aspect) : fov;
    const distance = radius / Math.sin(limitingFov / 2) * 1.08;
    controls.target.copy(center);
    camera.position.copy(center).add(direction.clone().normalize().multiplyScalar(distance));
    controls.update();
    controls.enableDamping = !reducedMotion.matches;
    updateMotion();
  }

  function setView(name) {
    if (!model || failed || !views[name]) return;
    currentView = name;
    clearSelection();
    assemblyView.setOpen(name === 'open' ? 1 : 0);
    if (name === 'hand' && !hand) {
      hand = createHandReference();
      scene.add(hand.group);
      renderer.domElement.dataset.handLengthMm = String(hand.handLengthMm);
    }
    if (hand) hand.group.visible = name === 'hand';
    replayButton.hidden = name !== 'hand';
    screenDemoButton.hidden = name !== 'screen';
    model.position.copy(modelBase);
    scaleReference.setMode(name === 'size' ? 'scale' : 'hidden');
    scaleReference.gridGroup.visible = false;
    if (name === 'hand') {
      model.position.add(new THREE.Vector3(...hand.placement.spark));
      if (motion.active) hand.replayGrip();
      else hand.setGrip(1);
    }
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    if (scaleReference.reference.visible) box.union(new THREE.Box3().setFromObject(scaleReference.reference));
    if (hand?.group.visible) box.union(hand.framingBox);
    environment.setFloorY(box.min.y - 0.5);
    renderer.shadowMap.needsUpdate = true;
    const directions = {
      overview: new THREE.Vector3(0.4, 0.18, 1),
      size: new THREE.Vector3(0.2, 0.14, 1),
      hand: new THREE.Vector3(0.08, 0.12, 1),
      open: new THREE.Vector3(0.45, 0.18, -1),
      screen: new THREE.Vector3(0.04, 0.03, 1),
    };
    if (name === 'screen' && screenMesh) {
      const closeUp = new THREE.Box3().setFromObject(partIndex.parts.get('display_lens_reference')).expandByScalar(5);
      positionCamera(closeUp, directions.screen);
    } else positionCamera(box, directions[name]);
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === name));
    document.getElementById('view-mode').textContent = views[name];
    renderer.domElement.dataset.view = name;
    renderer.domElement.dataset.open = String(name === 'open');
    renderer.domElement.dataset.handVisible = String(name === 'hand');
  }
  for (const button of viewButtons) button.addEventListener('click', () => setView(button.dataset.view));
  function turn(degrees) {
    if (!model || failed) return;
    pauseMotion();
    stepOrbit(controls, degrees);
    scheduler.request();
  }
  renderer.domElement.addEventListener('keydown', event => {
    if (!model || failed) return;
    const actions = {
      ArrowLeft: () => turn(-10), ArrowRight: () => turn(10),
      ArrowUp: () => controls.rotateUp(Math.PI / 36), ArrowDown: () => controls.rotateUp(-Math.PI / 36),
      '+': () => controls.dollyIn(0.9), '=': () => controls.dollyIn(0.9), '-': () => controls.dollyOut(0.9),
      Home: () => setView(currentView), Escape: () => select(null),
      ' ': () => motionButton.click(),
    };
    if (handleViewerShortcut(event, actions, key => { if (key !== ' ') pauseMotion(); })) {
      controls.update(0);
      scheduler.request();
    }
  });
  renderer.domElement.addEventListener('pointerdown', event => {
    down = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY, id: event.pointerId, dragged: false } : null;
  });
  renderer.domElement.addEventListener('pointermove', event => {
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) down.dragged = true;
  });
  renderer.domElement.addEventListener('pointercancel', () => { down = null; });
  renderer.domElement.addEventListener('pointerup', event => {
    const click = down && !down.dragged && down.id === event.pointerId;
    down = null;
    if (!click) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false).find(({ object }) => {
      for (let candidate = object; candidate; candidate = candidate.parent) if (!candidate.visible) return false;
      return true;
    });
    select(hit?.object || null);
  });

  const bytes = Uint8Array.from(atob(document.getElementById('model-data').textContent.trim()), character => character.charCodeAt(0));
  new GLTFLoader().parse(bytes.buffer, '', gltf => {
    if (failed) return;
    model = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(model);
    if (Math.max(...bounds.getSize(new THREE.Vector3()).toArray()) < 1) model.scale.setScalar(1000);
    bounds.setFromObject(model);
    model.position.sub(bounds.getCenter(new THREE.Vector3()));
    modelBase = model.position.clone();
    partIndex = indexAssemblyParts(model);
    model.traverse(object => {
      if (!object.isMesh) return;
      object.material = object.material.clone();
      object.castShadow = true;
      object.receiveShadow = true;
    });
    scene.add(model);
    model.updateMatrixWorld(true);
    assemblyView = createAssemblyView({ model, partIndex });
    model.traverse(object => { if (object.isMesh) pickables.push(object); });
    const presentation = assemblyView.screenPresentation;
    if (presentation) {
      displayTexture = new THREE.CanvasTexture(displayCanvas);
      displayTexture.colorSpace = THREE.SRGBColorSpace;
      displayTexture.magFilter = THREE.NearestFilter;
      displayTexture.minFilter = THREE.NearestFilter;
      displayTexture.generateMipmaps = false;
      function screen(parent, z) {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(presentation.widthMm, presentation.heightMm), new THREE.MeshBasicMaterial({
          map: displayTexture, toneMapped: false, transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
        }));
        plane.userData.partName = 'display_active_reference';
        plane.userData.visualDetail = true;
        plane.position.copy(presentation.center);
        plane.position.z = z;
        scene.add(plane);
        parent.attach(plane);
        pickables.push(plane);
        return plane;
      }
      screenMesh = screen(presentation.part, presentation.z);
      screen(presentation.exterior.part, presentation.exterior.z);
    }
    const modelSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    scaleReference = createScaleReference(scene, -contract.dimensions.length / 2, referenceDimensions);
    renderer.domElement.dataset.referenceMm = JSON.stringify(referenceDimensions);
    renderer.domElement.dataset.modelMm = JSON.stringify(modelSize.toArray());
    setView('overview');
    status.textContent = 'Live 3D';
    document.getElementById('loading').hidden = true;
    for (const control of [...viewButtons, ...finishButtons, sceneSelect, motionButton, replayButton, screenDemoButton]) control.disabled = false;
    scheduler.request();
  }, showError);
} catch (error) {
  showError(error);
}
