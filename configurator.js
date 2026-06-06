import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const D = {
  height: 22, width: 9, depth: 0.7,
  frameW: 0.45, panelW: 6,
};

const RAL_COLORS = {
  ral9005: { name: 'Diepzwart',    hex: '#1C1C1C', roughness: 0.18 },
  ral9010: { name: 'Zuiverwit',    hex: '#F2EEE6', roughness: 0.38 },
  ral7016: { name: 'Antraciet',    hex: '#3A4044', roughness: 0.22 },
  ral7040: { name: 'Venstergrijs', hex: '#8E9498', roughness: 0.32 },
  ral6003: { name: 'Olijfgroen',   hex: '#454D3C', roughness: 0.28 },
  ral8019: { name: 'Grijsbruin',   hex: '#46382E', roughness: 0.30 },
  ral1019: { name: 'Grijs-beige',  hex: '#A89880', roughness: 0.36 },
  ral7035: { name: 'Lichtgrijs',   hex: '#C4CCC8', roughness: 0.40 },
  ral3005: { name: 'Wijnrood',     hex: '#622030', roughness: 0.25 },
};

const GLASS_TYPES = {
  helder:  { color: '#B4D0C8', transmission: 0.92, roughness: 0.03 },
  mat:     { color: '#F2F0EC', transmission: 0.22, roughness: 0.95 }, // koel wit, duidelijk opaque
  gerookt: { color: '#28282E', transmission: 0.52, roughness: 0.05 }, // iets lichter — frame-kleur nog zichtbaar
  antiek:  { color: '#D4C890', transmission: 0.76, roughness: 0.10 }, // warm amber, elegant
  ribbel:  { color: '#C8B8A0', transmission: 0.48, roughness: 0.65 }, // warm beige, zichtbaar anders dan mat
  // massief: geen glass material — handled separately in buildGlass()
};

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  model:    'scharnier',
  color:    'ral9005',
  glass:    'helder',
  pattern:  'grid34',
  panel:    'beide',
  panelMat: 'glas',
  isOpen:   false,
};

let doorOpenAngle  = 0, doorTargetAngle  = 0;
let doorOpenSlide  = 0, doorTargetSlide  = 0;
let leafBaseZ      = 0;

// ─── Renderer ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping      = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled   = true;
renderer.shadowMap.type      = THREE.PCFSoftShadowMap;

// ─── Scene ───────────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1A1614');

const roomGroup = new THREE.Group(); // kamer-context — wordt verborgen in foto-modus
scene.add(roomGroup);

// ─── Camera ──────────────────────────────────────────────────────────────────

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 300);
camera.position.set(0, 2, 65);

// ─── Controls ────────────────────────────────────────────────────────────────

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping   = true;
controls.dampingFactor   = 0.05;
controls.minDistance     = 12;
controls.maxDistance     = 110;
controls.maxPolarAngle   = Math.PI / 2.1;
controls.enablePan       = false;
controls.target.set(0, 0, 0);
controls.update();

// ─── Lights ──────────────────────────────────────────────────────────────────

const ambient = new THREE.AmbientLight(0xffffff, 1.8);
scene.add(ambient);

const key = new THREE.DirectionalLight(0xffffff, 3.5);
key.position.set(6, 10, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.5;
key.shadow.camera.far  = 80;
key.shadow.camera.left = key.shadow.camera.bottom = -25;
key.shadow.camera.right = key.shadow.camera.top  =  25;
scene.add(key);

const rim  = new THREE.DirectionalLight(0xC8A87A, 1.4);
rim.position.set(-6, 4, -4);
scene.add(rim);

const fill = new THREE.DirectionalLight(0xffffff, 0.9);
fill.position.set(-4, 6, 10);
scene.add(fill);

// ─── HDRI (improves reflections when loaded) ──────────────────────────────────

const pmremGen = new THREE.PMREMGenerator(renderer);
pmremGen.compileEquirectangularShader();
new RGBELoader().load(
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr',
  (hdr) => {
    const envMap = pmremGen.fromEquirectangular(hdr).texture;
    scene.environment = envMap;
    scene.environmentIntensity = 0.9;
    ambient.intensity = 0.5;
    hdr.dispose(); pmremGen.dispose();
    buildDoor();
    buildSidePanels();
  }
);

// ─── Environment: wall + floor ───────────────────────────────────────────────

const backWallZ  = -12;
const openingW   = D.width + D.panelW * 2;     // 21 — deur + beide zijpanelen
const wallFaceZ  = D.depth * 0.45;              // flush met voorkant deurframe

const wallMat = new THREE.MeshStandardMaterial({ color: '#E8E4DF', roughness: 0.95, metalness: 0 });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), wallMat);
wall.position.set(0, 1, backWallZ);
wall.receiveShadow = true;
roomGroup.add(wall);

const floorMat = new THREE.MeshStandardMaterial({ color: '#B8864E', roughness: 0.72, metalness: 0 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -D.height / 2;
floor.receiveShadow = true;
roomGroup.add(floor);

// ─── Front wall: deur is ingebouwd in een echte muur ─────────────────────────

const fwMat = new THREE.MeshStandardMaterial({ color: '#EDE8E2', roughness: 0.90, metalness: 0 });
const wallH  = D.height + 6;

const fwLeft = new THREE.Mesh(new THREE.BoxGeometry(9, wallH, 0.28), fwMat);
fwLeft.position.set(-(openingW / 2 + 4.5), 1, wallFaceZ);
fwLeft.receiveShadow = true;
roomGroup.add(fwLeft);

const fwRight = new THREE.Mesh(new THREE.BoxGeometry(9, wallH, 0.28), fwMat);
fwRight.position.set(openingW / 2 + 4.5, 1, wallFaceZ);
fwRight.receiveShadow = true;
roomGroup.add(fwRight);

const fwTop = new THREE.Mesh(new THREE.BoxGeometry(openingW + 18, 5, 0.28), fwMat);
fwTop.position.set(0, D.height / 2 + 2.5, wallFaceZ);
fwTop.receiveShadow = true;
roomGroup.add(fwTop);

// Kamer: zijwanden (loodrecht, van voormuur naar achterwand)
const sideMat     = new THREE.MeshStandardMaterial({ color: '#E4DDD6', roughness: 0.94, metalness: 0 });
const roomDepth   = wallFaceZ - backWallZ;
const sideGeo     = new THREE.PlaneGeometry(roomDepth, wallH);
const sideCenterZ = wallFaceZ - roomDepth / 2;

const roomSideL = new THREE.Mesh(sideGeo, sideMat);
roomSideL.rotation.y = Math.PI / 2;
roomSideL.position.set(-openingW / 2, 1, sideCenterZ);
roomSideL.receiveShadow = true;
roomGroup.add(roomSideL);

const roomSideR = new THREE.Mesh(sideGeo, sideMat);
roomSideR.rotation.y = -Math.PI / 2;
roomSideR.position.set(openingW / 2, 1, sideCenterZ);
roomSideR.receiveShadow = true;
roomGroup.add(roomSideR);

// ─── Groups ──────────────────────────────────────────────────────────────────

// ─── Groups ──────────────────────────────────────────────────────────────────

const frameGroup    = new THREE.Group();
let   leafPivot     = new THREE.Group();
let   glassInLeaf   = new THREE.Group();
const sidePanelGroup = new THREE.Group();
scene.add(frameGroup, leafPivot, sidePanelGroup);

// ─── Materials ───────────────────────────────────────────────────────────────

let steelMaterial = null;
let glassMaterial = null;
let sidePanelGlassMaterial = null;

function makeSteelMaterial() {
  if (steelMaterial) steelMaterial.dispose();
  const ral = RAL_COLORS[state.color];
  steelMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ral.hex),
    metalness: 0.75,
    roughness: ral.roughness,
  });
  return steelMaterial;
}

function makeGlassMaterial() {
  if (glassMaterial) glassMaterial.dispose();
  const g = GLASS_TYPES[state.glass] || GLASS_TYPES.helder;
  glassMaterial = new THREE.MeshPhysicalMaterial({
    color:        new THREE.Color(g.color),
    transmission: g.transmission,
    roughness:    g.roughness,
    ior:          1.5,
    thickness:    0.06,
    side:         THREE.DoubleSide,
  });
  return glassMaterial;
}

function makeSidePanelGlass() {
  if (sidePanelGlassMaterial) sidePanelGlassMaterial.dispose();
  // Duidelijk donkerder/meer opaque dan deurgas → paneel springt minder in het oog dan de deur
  sidePanelGlassMaterial = new THREE.MeshPhysicalMaterial({
    color:        new THREE.Color('#4A7A70'),
    transmission: 0.42,
    roughness:    0.10,
    ior:          1.5,
    thickness:    0.06,
    side:         THREE.DoubleSide,
  });
  return sidePanelGlassMaterial;
}

// ─── Dispose ─────────────────────────────────────────────────────────────────

function disposeGroup(group) {
  group.traverse(child => { if (child.isMesh) child.geometry?.dispose(); });
  group.clear();
}

// ─── Base geometry builders ───────────────────────────────────────────────────

function buildFrame(dims, mat) {
  const { height, width, depth, frameW } = dims;
  const g = new THREE.Group();
  const hBar = new THREE.BoxGeometry(width, frameW, depth);
  const vBar = new THREE.BoxGeometry(frameW, height - frameW * 2, depth);

  [[0, height / 2 - frameW / 2, 0, hBar],
   [0, -(height / 2 - frameW / 2), 0, hBar],
   [-(width / 2 - frameW / 2), 0, 0, vBar],
   [width / 2 - frameW / 2, 0, 0, vBar],
  ].forEach(([x, y, z, geo]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  });
  return g;
}

function buildPanel(dims, mat) {
  const { height, width, depth, frameW } = dims;
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(width - frameW * 2, height - frameW * 2, depth * 0.55),
    mat
  );
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function buildHandle(mat) {
  const g = new THREE.Group();
  // Modern vertical pull bar
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.10, 3.4, 0.10), mat);
  bar.position.z = D.depth * 0.62;
  bar.castShadow = true;
  g.add(bar);
  // Top + bottom brackets
  const bkt = new THREE.BoxGeometry(0.10, 0.12, 0.46);
  [-1.7, 1.7].forEach(y => {
    const b = new THREE.Mesh(bkt, mat);
    b.position.set(0, y, D.depth * 0.35);
    b.castShadow = true;
    g.add(b);
  });
  return g;
}

// Place all leaf contents (panel + handle + glass group) with correct offset from pivot
function makeDoorLeaf(mat, pivotX) {
  const leaf = new THREE.Group();

  // Geen solide paneel — stalen deur is frame + glas, geen dichte plaat

  const handle = buildHandle(mat);
  // Handle on right side of door, at handle height (100cm from floor)
  handle.position.set(D.width / 2 - D.frameW - 0.9 - pivotX, -1.0, 0);
  leaf.add(handle);

  glassInLeaf = new THREE.Group();
  glassInLeaf.position.x = -pivotX;
  leaf.add(glassInLeaf);

  return leaf;
}

// ─── Door model builders ──────────────────────────────────────────────────────

function buildTaatsdoor(mat) {
  frameGroup.add(buildFrame(D, mat));
  leafPivot.position.set(0, 0, 0);
  leafPivot.add(makeDoorLeaf(mat, 0));
}

function buildScharnierdoor(mat) {
  frameGroup.add(buildFrame(D, mat));

  // Hinges on left stile (static part of frame)
  const hingeGeo = new THREE.BoxGeometry(0.85, 1.3, D.depth + 0.4);
  const hingeX   = -(D.width / 2 - D.frameW / 2) - 0.15;
  [-D.height * 0.3, 0, D.height * 0.3].forEach(y => {
    const h = new THREE.Mesh(hingeGeo, mat);
    h.position.set(hingeX, y, 0);
    h.castShadow = true;
    frameGroup.add(h);
  });

  const pivotX = -(D.width / 2 - D.frameW);
  leafPivot.position.set(pivotX, 0, 0);
  leafPivot.add(makeDoorLeaf(mat, pivotX));
}

function buildSchuifdoor(mat) {
  frameGroup.add(buildFrame(D, mat));

  // Rail bovenaan (static)
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, D.width + 2.5, 12), mat);
  rail.rotation.z = Math.PI / 2;
  rail.position.y = D.height / 2 + 0.35;
  rail.castShadow = true;
  frameGroup.add(rail);

  leafBaseZ = D.depth * 0.85;
  leafPivot.position.set(0, 0, leafBaseZ);
  leafPivot.add(makeDoorLeaf(mat, 0));
}

// ─── Glass pattern builders ───────────────────────────────────────────────────

function glassPanel(w, h, gMat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.10), gMat);
  return m;
}

function steelBar(w, h, sMat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), sMat);
  m.castShadow = true;
  return m;
}

function buildGlassContent(dims, gMat, sMat) {
  const { height, width, frameW } = dims;
  const iW = width - frameW * 2;
  const iH = height - frameW * 2;
  const g   = new THREE.Group();

  switch (state.pattern) {
    case 'h2': {
      const barH = 0.35;
      const panH = (iH - barH) / 2;
      [panH / 2 + barH / 2, -(panH / 2 + barH / 2)].forEach(y => {
        const p = glassPanel(iW, panH, gMat); p.position.y = y; g.add(p);
      });
      g.add(steelBar(iW, barH, sMat));
      break;
    }
    case 'h3': {
      const barH = 0.35, nBars = 2;
      const panH = (iH - barH * nBars) / 3;
      const yPositions = [panH + barH, 0, -(panH + barH)];
      yPositions.forEach(y => { const p = glassPanel(iW, panH, gMat); p.position.y = y; g.add(p); });
      [-barH / 2 - panH / 2 + (panH + barH), barH / 2 + panH / 2 - (panH + barH)].forEach(y => {
        const b = steelBar(iW, barH, sMat); b.position.y = y; g.add(b);
      });
      break;
    }
    case 'spijlen': {
      const n = 4, sw = 0.18, sec = iW / (n + 1);
      g.add(glassPanel(iW, iH, gMat));
      for (let i = 1; i <= n; i++) {
        const s = steelBar(sw, iH, sMat); s.position.x = -iW / 2 + sec * i; g.add(s);
      }
      break;
    }
    case 'grid23': {
      const cols = 2, rows = 3, rW = 0.14;
      const cW = (iW - rW * (cols - 1)) / cols;
      const cH = (iH - rW * (rows - 1)) / rows;
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
        const p = glassPanel(cW, cH, gMat);
        p.position.set(-iW / 2 + cW / 2 + c * (cW + rW), -iH / 2 + cH / 2 + r * (cH + rW), 0);
        g.add(p);
      }
      for (let r = 1; r < rows; r++) { const b = steelBar(iW, rW, sMat); b.position.y = -iH / 2 + r * (cH + rW) - rW / 2; g.add(b); }
      for (let c = 1; c < cols; c++) { const b = new THREE.Mesh(new THREE.BoxGeometry(rW, iH, 0.14), sMat); b.position.x = -iW / 2 + c * (cW + rW) - rW / 2; b.castShadow = true; g.add(b); }
      break;
    }
    case 'grid34': {
      const cols = 3, rows = 4, rW = 0.12;
      const cW = (iW - rW * (cols - 1)) / cols;
      const cH = (iH - rW * (rows - 1)) / rows;
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
        const p = glassPanel(cW, cH, gMat);
        p.position.set(-iW / 2 + cW / 2 + c * (cW + rW), -iH / 2 + cH / 2 + r * (cH + rW), 0);
        g.add(p);
      }
      for (let r = 1; r < rows; r++) { const b = steelBar(iW, rW, sMat); b.position.y = -iH / 2 + r * (cH + rW) - rW / 2; g.add(b); }
      for (let c = 1; c < cols; c++) { const b = new THREE.Mesh(new THREE.BoxGeometry(rW, iH, 0.14), sMat); b.position.x = -iW / 2 + c * (cW + rW) - rW / 2; b.castShadow = true; g.add(b); }
      break;
    }
    default: { // volledig
      g.add(glassPanel(iW, iH, gMat));
    }
  }
  return g;
}

// ─── Side panel builder ───────────────────────────────────────────────────────

function buildOneSidePanel(side) {
  const { height, panelW, depth } = D;
  const frameW = 0.35; // thinner than door frame — shows door is more substantial
  const iW = panelW - frameW * 2;
  const iH = height - frameW * 2;
  const mat = steelMaterial || makeSteelMaterial();
  const g = new THREE.Group();
  const xOff = side === 'links' ? -(D.width / 2 + panelW / 2) : D.width / 2 + panelW / 2;
  g.position.x = xOff;

  // Volledig frame: boven, onder, buitenstijl, binnenstijl
  const hBar   = new THREE.BoxGeometry(panelW, frameW, depth);
  const vBar   = new THREE.BoxGeometry(frameW, iH, depth);
  const outerX = side === 'links' ? -(panelW / 2 - frameW / 2) :  (panelW / 2 - frameW / 2);
  const innerX = side === 'links' ?  (panelW / 2 - frameW / 2) : -(panelW / 2 - frameW / 2);
  [[0, height / 2 - frameW / 2, hBar],
   [0, -(height / 2 - frameW / 2), hBar],
   [outerX, 0, vBar],
   [innerX, 0, vBar],
  ].forEach(([x, y, geo]) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); m.castShadow = true; g.add(m);
  });

  // Glas (helder, vast) of muur (wand-kleur, solide)
  if (state.panelMat === 'muur') {
    const muurMat = new THREE.MeshStandardMaterial({ color: '#EDE8E2', roughness: 0.90, metalness: 0 });
    const muur = new THREE.Mesh(new THREE.BoxGeometry(iW, iH, depth * 0.85), muurMat);
    muur.receiveShadow = true;
    g.add(muur);
  } else {
    const gm = new THREE.Mesh(new THREE.BoxGeometry(iW, iH, 0.10), makeSidePanelGlass());
    g.add(gm);
  }

  return g;
}

// ─── Build functions ──────────────────────────────────────────────────────────

function buildDoor() {
  disposeGroup(frameGroup);
  scene.remove(leafPivot);
  leafPivot = new THREE.Group();
  glassInLeaf = null;
  scene.add(leafPivot);

  doorOpenAngle = doorTargetAngle = 0;
  doorOpenSlide = doorTargetSlide = 0;
  leafBaseZ = 0;
  state.isOpen = false;
  updateOpenButton();

  const mat = makeSteelMaterial();
  switch (state.model) {
    case 'scharnier': buildScharnierdoor(mat); break;
    case 'schuif':    buildSchuifdoor(mat);    break;
    default:          buildTaatsdoor(mat);
  }
  buildGlass();
}

function buildGlass() {
  if (!glassInLeaf) return;
  disposeGroup(glassInLeaf);

  if (state.glass === 'massief') {
    // Solid steel panel — geen glas
    const { height, width, frameW, depth } = D;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(width - frameW * 2, height - frameW * 2, depth * 0.5),
      steelMaterial || makeSteelMaterial()
    );
    panel.castShadow = true;
    glassInLeaf.add(panel);
    return;
  }

  const gMat = makeGlassMaterial();
  const sMat = steelMaterial || makeSteelMaterial();
  glassInLeaf.add(buildGlassContent(D, gMat, sMat));
}

function buildSidePanels() {
  disposeGroup(sidePanelGroup);
  if (state.panel === 'geen') return;
  if (state.panel === 'links'  || state.panel === 'beide') sidePanelGroup.add(buildOneSidePanel('links'));
  if (state.panel === 'rechts' || state.panel === 'beide') sidePanelGroup.add(buildOneSidePanel('rechts'));
}

// ─── Setters ─────────────────────────────────────────────────────────────────

function setModel(v)   { state.model   = v; buildDoor(); buildSidePanels(); syncGroup('model', v); }
function setColor(v)   { state.color   = v; buildDoor(); buildSidePanels(); syncSwatches(); }
function setGlass(v)    { state.glass    = v; buildGlass(); syncGroup('glass', v); }
function setPattern(v)  { state.pattern  = v; buildGlass(); syncGroup('pattern', v); }
function setPanel(v)    { state.panel    = v; buildSidePanels(); syncGroup('panel', v); }
function setPanelMat(v) { state.panelMat = v; buildSidePanels(); syncGroup('panelmat', v); }

function toggleDoor() {
  state.isOpen = !state.isOpen;
  if (state.model === 'taats') {
    doorTargetAngle = state.isOpen ? -Math.PI * 0.38 : 0;
  } else if (state.model === 'scharnier') {
    doorTargetAngle = state.isOpen ? -Math.PI * 0.70 : 0;
  } else {
    doorTargetSlide = state.isOpen ? D.width + 1.5 : 0;
  }
  updateOpenButton();
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function syncGroup(name, val) {
  document.querySelectorAll(`[data-group="${name}"] .option-btn`).forEach(b => {
    b.classList.toggle('active', b.dataset.value === val);
  });
}

function syncSwatches() {
  document.querySelectorAll('.color-swatch').forEach(b => {
    b.classList.toggle('active', b.dataset.ral === state.color);
  });
}

function updateOpenButton() {
  const btn = document.getElementById('open-btn');
  if (!btn) return;
  btn.textContent = state.isOpen ? 'Sluit deur' : 'Open deur';
  btn.classList.toggle('is-open', state.isOpen);
}

function buildSwatches() {
  const c = document.getElementById('color-swatches');
  Object.entries(RAL_COLORS).forEach(([key, ral]) => {
    const btn = document.createElement('button');
    btn.className   = 'color-swatch' + (key === state.color ? ' active' : '');
    btn.style.background = ral.hex;
    btn.title       = `${key.replace('ral', 'RAL ')} — ${ral.name}`;
    btn.dataset.ral = key;
    btn.addEventListener('click', () => setColor(key));
    c.appendChild(btn);
  });
}

function wireButtons() {
  document.querySelectorAll('[data-group="model"] .option-btn').forEach(b =>
    b.addEventListener('click', () => setModel(b.dataset.value)));
  document.querySelectorAll('[data-group="glass"] .option-btn').forEach(b =>
    b.addEventListener('click', () => setGlass(b.dataset.value)));
  document.querySelectorAll('[data-group="pattern"] .option-btn').forEach(b =>
    b.addEventListener('click', () => setPattern(b.dataset.value)));
  document.querySelectorAll('[data-group="panel"] .option-btn').forEach(b =>
    b.addEventListener('click', () => setPanel(b.dataset.value)));
  document.querySelectorAll('[data-group="panelmat"] .option-btn').forEach(b =>
    b.addEventListener('click', () => setPanelMat(b.dataset.value)));
  document.getElementById('open-btn')?.addEventListener('click', toggleDoor);
}

// ─── Resize ───────────────────────────────────────────────────────────────────

function updateSize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w <= 0 || h <= 0) { requestAnimationFrame(updateSize); return; }
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', updateSize);
window.addEventListener('orientationchange', () => setTimeout(updateSize, 200));

// ─── Animate ─────────────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  if (leafPivot) {
    if (state.model === 'schuif') {
      doorOpenSlide += (doorTargetSlide - doorOpenSlide) * 0.07;
      leafPivot.position.set(doorOpenSlide, 0, leafBaseZ);
    } else {
      doorOpenAngle += (doorTargetAngle - doorOpenAngle) * 0.07;
      leafPivot.rotation.y = doorOpenAngle;
    }
  }

  renderer.render(scene, camera);
}

// ─── Init ────────────────────────────────────────────────────────────────────

buildSwatches();
wireButtons();
buildDoor();
buildSidePanels();
updateSize();
animate();
