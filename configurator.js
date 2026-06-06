import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const DOOR_DIMS = {
  height: 22,
  width:   9,
  depth:  0.8,
  frameW: 0.5,
  panelW:  6,
};

const RAL_COLORS = {
  ral9005: { name: 'Diepzwart',  hex: '#1A1A1A', roughness: 0.20 },
  ral9010: { name: 'Zuiverwit',  hex: '#F4F0E8', roughness: 0.35 },
  ral7016: { name: 'Antraciet',  hex: '#4A5258', roughness: 0.22 },
  ral8019: { name: 'Grijsbruin', hex: '#5C4F4A', roughness: 0.30 },
  ral7035: { name: 'Lichtgrijs', hex: '#CBD0CC', roughness: 0.40 },
  ral6005: { name: 'Mosgroen',   hex: '#2D5A3D', roughness: 0.28 },
  ral3005: { name: 'Wijnrood',   hex: '#7A2830', roughness: 0.25 },
};

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  model: 'taats',
  color: 'ral9005',
  glass: 'volledig',
  panel: 'geen',
};

// ─── Renderer ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(new THREE.Color('#1E1A18'));

// ─── Scene ───────────────────────────────────────────────────────────────────

const scene = new THREE.Scene();

// ─── Camera ──────────────────────────────────────────────────────────────────

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 150);
camera.position.set(0, 2, 32);

// ─── Controls ────────────────────────────────────────────────────────────────

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 12;
controls.maxDistance = 55;
controls.maxPolarAngle = Math.PI / 2;
controls.enablePan = false;
controls.target.set(0, 1.1, 0);
controls.update();

// ─── Lights ──────────────────────────────────────────────────────────────────

// Ambient zodat materialen altijd zichtbaar zijn ook zonder HDRI
const ambient = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
keyLight.position.set(5, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width  = 2048;
keyLight.shadow.mapSize.height = 2048;
keyLight.shadow.camera.near   = 0.5;
keyLight.shadow.camera.far    = 60;
keyLight.shadow.camera.left   = -20;
keyLight.shadow.camera.right  =  20;
keyLight.shadow.camera.top    =  20;
keyLight.shadow.camera.bottom = -20;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xC8A87A, 1.2);
rimLight.position.set(-5, 3, -3);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
fillLight.position.set(-3, 5, 8);
scene.add(fillLight);

// ─── HDRI (optioneel — verbetert reflecties als geladen) ─────────────────────

const pmremGen = new THREE.PMREMGenerator(renderer);
pmremGen.compileEquirectangularShader();

new RGBELoader().load(
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr',
  (hdrTexture) => {
    const envMap = pmremGen.fromEquirectangular(hdrTexture).texture;
    scene.environment = envMap;
    scene.environmentIntensity = 1.0;
    // Met HDRI: verlaag ambient want HDRI doet het diffuse werk
    ambient.intensity = 0.3;
    hdrTexture.dispose();
    pmremGen.dispose();
    // Refresh materials voor HDRI reflecties
    buildDoor();
    buildGlass();
    buildSidePanels();
  }
);

// ─── Floor (shadow receiver) ─────────────────────────────────────────────────

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.ShadowMaterial({ opacity: 0.3 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -DOOR_DIMS.height / 2;
floor.receiveShadow = true;
scene.add(floor);

// ─── Door groups ─────────────────────────────────────────────────────────────

const doorGroup      = new THREE.Group();
const glassGroup     = new THREE.Group();
const sidePanelGroup = new THREE.Group();
scene.add(doorGroup, glassGroup, sidePanelGroup);

// ─── Materials ───────────────────────────────────────────────────────────────

let steelMaterial = null;
let glassMaterial  = null;

function makeSteelMaterial() {
  if (steelMaterial) steelMaterial.dispose();
  const ral = RAL_COLORS[state.color];
  steelMaterial = new THREE.MeshStandardMaterial({
    color:     new THREE.Color(ral.hex),
    metalness: 0.7,
    roughness: ral.roughness,
  });
  return steelMaterial;
}

function makeGlassMaterial() {
  if (glassMaterial) glassMaterial.dispose();
  glassMaterial = new THREE.MeshPhysicalMaterial({
    transmission: 0.85,
    ior:          1.5,
    roughness:    0.05,
    thickness:    0.05,
    color:        new THREE.Color('#AACCBB'),
    side:         THREE.DoubleSide,
  });
  return glassMaterial;
}

// ─── Dispose helper ──────────────────────────────────────────────────────────

function disposeGroup(group) {
  group.traverse(child => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    // Materials worden apart beheerd — niet hier disposen
  });
  group.clear();
}

// ─── Frame builder ───────────────────────────────────────────────────────────

function buildFrame(dims, mat) {
  const { height, width, depth, frameW } = dims;
  const group = new THREE.Group();

  const hBar = new THREE.BoxGeometry(width, frameW, depth);

  const top = new THREE.Mesh(hBar, mat);
  top.position.y = height / 2 - frameW / 2;
  top.castShadow = true;
  group.add(top);

  const bottom = new THREE.Mesh(hBar.clone(), mat);
  bottom.position.y = -(height / 2 - frameW / 2);
  bottom.castShadow = true;
  group.add(bottom);

  const innerH = height - frameW * 2;
  const vBar = new THREE.BoxGeometry(frameW, innerH, depth);

  const left = new THREE.Mesh(vBar, mat);
  left.position.x = -(width / 2 - frameW / 2);
  left.castShadow = true;
  group.add(left);

  const right = new THREE.Mesh(vBar.clone(), mat);
  right.position.x = width / 2 - frameW / 2;
  right.castShadow = true;
  group.add(right);

  return group;
}

function buildDoorPanel(dims, mat) {
  const { height, width, depth, frameW } = dims;
  const innerW = width  - frameW * 2;
  const innerH = height - frameW * 2;
  const geo  = new THREE.BoxGeometry(innerW, innerH, depth * 0.6);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

// ─── Door models ─────────────────────────────────────────────────────────────

function buildTaatsdeur(dims, mat) {
  const group = new THREE.Group();
  group.add(buildFrame(dims, mat));
  group.add(buildDoorPanel(dims, mat));
  return group;
}

function buildScharnierdeur(dims, mat) {
  const group = new THREE.Group();
  group.add(buildFrame(dims, mat));
  group.add(buildDoorPanel(dims, mat));

  // Grote scharnieren zodat model duidelijk herkenbaar is
  const { height, width, depth } = dims;
  const hingeGeo = new THREE.BoxGeometry(0.8, 1.4, depth + 0.5);
  [-height * 0.3, 0, height * 0.3].forEach(y => {
    const hinge = new THREE.Mesh(hingeGeo, mat);
    hinge.position.set(width / 2 + 0.1, y, 0);
    hinge.castShadow = true;
    group.add(hinge);
  });
  return group;
}

function buildSchuifdeur(dims, mat) {
  const { height, width, depth } = dims;
  const group = new THREE.Group();
  group.add(buildFrame(dims, mat));

  // Deurblad iets naar voren (hangt voor het frame)
  const panel = buildDoorPanel(dims, mat);
  panel.position.z = depth * 0.8;
  group.add(panel);

  // Rail bovenaan — duidelijk zichtbaar
  const railGeo = new THREE.CylinderGeometry(0.2, 0.2, width + 2, 12);
  const rail = new THREE.Mesh(railGeo, mat);
  rail.rotation.z = Math.PI / 2;
  rail.position.y = height / 2 + 0.4;
  rail.castShadow = true;
  group.add(rail);

  // Rail support links en rechts
  const supportGeo = new THREE.BoxGeometry(0.3, 0.8, 0.3);
  [-width / 2 - 0.5, width / 2 + 0.5].forEach(x => {
    const support = new THREE.Mesh(supportGeo, mat);
    support.position.set(x, height / 2 + 0.4, 0);
    group.add(support);
  });

  return group;
}

// ─── Glass patterns ──────────────────────────────────────────────────────────

function buildFullGlass(dims, glassMat) {
  const { height, width, frameW } = dims;
  const innerW = width  - frameW * 2;
  const innerH = height - frameW * 2;
  const geo = new THREE.BoxGeometry(innerW, innerH, 0.12);
  return new THREE.Mesh(geo, glassMat);
}

function buildVerticalMullions(dims, steelMat, glassMat) {
  const group = new THREE.Group();
  const { height, width, frameW } = dims;
  const innerW = width  - frameW * 2;
  const innerH = height - frameW * 2;
  const mullionCount = 4;
  const mullionW = 0.18;
  const sectionW = innerW / (mullionCount + 1);

  group.add(new THREE.Mesh(
    new THREE.BoxGeometry(innerW, innerH, 0.1),
    glassMat
  ));

  const spijlGeo = new THREE.BoxGeometry(mullionW, innerH, 0.15);
  for (let i = 1; i <= mullionCount; i++) {
    const spijl = new THREE.Mesh(spijlGeo.clone(), steelMat);
    spijl.position.x = -innerW / 2 + sectionW * i;
    spijl.castShadow = true;
    group.add(spijl);
  }
  return group;
}

function buildGridGlass(dims, steelMat, glassMat) {
  const group = new THREE.Group();
  const { height, width, frameW } = dims;
  const innerW = width  - frameW * 2;
  const innerH = height - frameW * 2;
  const cols = 3, rows = 5;
  const rodW = 0.1;
  const cellW = (innerW - rodW * (cols - 1)) / cols;
  const cellH = (innerH - rodW * (rows - 1)) / rows;

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cell = new THREE.Mesh(
        new THREE.BoxGeometry(cellW, cellH, 0.08),
        glassMat
      );
      cell.position.x = -innerW / 2 + cellW / 2 + c * (cellW + rodW);
      cell.position.y = -innerH / 2 + cellH / 2 + r * (cellH + rodW);
      group.add(cell);
    }
  }

  const hRodGeo = new THREE.BoxGeometry(innerW, rodW, 0.12);
  for (let r = 1; r < rows; r++) {
    const rod = new THREE.Mesh(hRodGeo.clone(), steelMat);
    rod.position.y = -innerH / 2 + r * (cellH + rodW) - rodW / 2;
    rod.castShadow = true;
    group.add(rod);
  }

  const vRodGeo = new THREE.BoxGeometry(rodW, innerH, 0.12);
  for (let c = 1; c < cols; c++) {
    const rod = new THREE.Mesh(vRodGeo.clone(), steelMat);
    rod.position.x = -innerW / 2 + c * (cellW + rodW) - rodW / 2;
    rod.castShadow = true;
    group.add(rod);
  }
  return group;
}

// ─── Side panel builder ───────────────────────────────────────────────────────

function buildOneSidePanel(side, dims, mat) {
  const { height, width, depth, panelW, frameW } = dims;
  const xOffset = side === 'links'
    ? -(width / 2 + panelW / 2)
    :   width / 2 + panelW / 2;

  const group = new THREE.Group();
  group.position.x = xOffset;

  // Frame rondom zijpaneel
  const hBar = new THREE.BoxGeometry(panelW, frameW, depth);
  const top = new THREE.Mesh(hBar, mat);
  top.position.y = height / 2 - frameW / 2;
  top.castShadow = true;
  group.add(top);

  const bottom = new THREE.Mesh(hBar.clone(), mat);
  bottom.position.y = -(height / 2 - frameW / 2);
  bottom.castShadow = true;
  group.add(bottom);

  const innerH = height - frameW * 2;
  const outerBar = new THREE.BoxGeometry(frameW, innerH, depth);
  const outer = new THREE.Mesh(outerBar, mat);
  outer.position.x = side === 'links' ? -panelW / 2 + frameW / 2 : panelW / 2 - frameW / 2;
  outer.castShadow = true;
  group.add(outer);

  // Glasvlak in zijpaneel
  const glassW = panelW - frameW * 2;
  const glassGeo = new THREE.BoxGeometry(glassW, innerH, 0.1);
  group.add(new THREE.Mesh(glassGeo, glassMaterial || makeGlassMaterial()));

  return group;
}

// ─── Build functions ──────────────────────────────────────────────────────────

function buildDoor() {
  disposeGroup(doorGroup);
  const mat = makeSteelMaterial();

  let built;
  if      (state.model === 'scharnier') built = buildScharnierdeur(DOOR_DIMS, mat);
  else if (state.model === 'schuif')    built = buildSchuifdeur(DOOR_DIMS, mat);
  else                                  built = buildTaatsdeur(DOOR_DIMS, mat);

  doorGroup.add(built);
}

function buildGlass() {
  disposeGroup(glassGroup);

  const steel = steelMaterial || makeSteelMaterial();
  const glass = makeGlassMaterial();

  let built;
  if      (state.glass === 'spijlen') built = buildVerticalMullions(DOOR_DIMS, steel, glass);
  else if (state.glass === 'ruitjes') built = buildGridGlass(DOOR_DIMS, steel, glass);
  else                                built = buildFullGlass(DOOR_DIMS, glass);

  glassGroup.add(built);
}

function buildSidePanels() {
  disposeGroup(sidePanelGroup);
  if (state.panel === 'geen') return;

  const mat = steelMaterial || makeSteelMaterial();
  if (state.panel === 'links' || state.panel === 'beide') {
    sidePanelGroup.add(buildOneSidePanel('links', DOOR_DIMS, mat));
  }
  if (state.panel === 'rechts' || state.panel === 'beide') {
    sidePanelGroup.add(buildOneSidePanel('rechts', DOOR_DIMS, mat));
  }
}

// ─── Setters ─────────────────────────────────────────────────────────────────

function setModel(value) {
  state.model = value;
  buildDoor();
  buildGlass();
  syncGroup('model', value);
}

function setColor(ralKey) {
  state.color = ralKey;
  buildDoor();
  buildGlass();
  buildSidePanels();
  syncSwatches();
}

function setGlass(value) {
  state.glass = value;
  buildGlass();
  syncGroup('glass', value);
}

function setPanel(value) {
  state.panel = value;
  buildSidePanels();
  syncGroup('panel', value);
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function syncGroup(groupName, activeValue) {
  document.querySelectorAll(`[data-group="${groupName}"] .option-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === activeValue);
  });
}

function syncSwatches() {
  document.querySelectorAll('.color-swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ral === state.color);
  });
}

function buildSwatches() {
  const container = document.getElementById('color-swatches');
  Object.entries(RAL_COLORS).forEach(([key, ral]) => {
    const btn = document.createElement('button');
    btn.className = 'color-swatch' + (key === state.color ? ' active' : '');
    btn.style.background = ral.hex;
    btn.title = `${key.toUpperCase().replace('RAL', 'RAL ')} — ${ral.name}`;
    btn.dataset.ral = key;
    btn.addEventListener('click', () => setColor(key));
    container.appendChild(btn);
  });
}

function wireButtons() {
  document.querySelectorAll('[data-group="model"] .option-btn').forEach(btn => {
    btn.addEventListener('click', () => setModel(btn.dataset.value));
  });
  document.querySelectorAll('[data-group="glass"] .option-btn').forEach(btn => {
    btn.addEventListener('click', () => setGlass(btn.dataset.value));
  });
  document.querySelectorAll('[data-group="panel"] .option-btn').forEach(btn => {
    btn.addEventListener('click', () => setPanel(btn.dataset.value));
  });
}

// ─── Resize ───────────────────────────────────────────────────────────────────

function updateSize() {
  const panel = document.querySelector('.config-panel');
  const panelW = panel ? panel.offsetWidth : 0;
  const w = window.innerWidth - panelW;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', updateSize);

// ─── Animate ─────────────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ─── Init ────────────────────────────────────────────────────────────────────

buildSwatches();
wireButtons();
buildDoor();
buildGlass();
buildSidePanels();
updateSize();
animate();
