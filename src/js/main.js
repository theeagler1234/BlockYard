import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { listFilePaths, saveProject } from './db.js';
import { listModels, importModelFiles, loadProjectModel } from './modelImport.js';

const $ = id => document.getElementById(id);
const view = $('viewport');

// --- Scene basics ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe6ee);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
camera.position.set(6, 5, 8);
scene.add(new THREE.GridHelper(40, 40, 0x8a97a8, 0xb8c2cf));
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(5, 10, 4);
scene.add(sun);

const orbit = new OrbitControls(camera, renderer.domElement);
const gizmo = new TransformControls(camera, renderer.domElement);
scene.add(gizmo);
gizmo.addEventListener('dragging-changed', e => (orbit.enabled = !e.value));
gizmo.addEventListener('objectChange', () => { syncProps(); changed(); });

new ResizeObserver(() => {
  const { clientWidth: w, clientHeight: h } = view;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}).observe(view);
renderer.setAnimationLoop(() => { orbit.update(); renderer.render(scene, camera); });

// --- Objects ---
const shapes = {
  Cube: () => new THREE.BoxGeometry(1, 1, 1),
  Sphere: () => new THREE.SphereGeometry(0.6, 32, 16),
  Cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  Cone: () => new THREE.ConeGeometry(0.6, 1.2, 32),
  Floor: () => new THREE.BoxGeometry(6, 0.2, 6),
};
const objects = [];
let selected = null;
let project = null;   // the open project; imported model files live inside it
const counts = {};

for (const name of Object.keys(shapes)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => addShape(name);
  $('adders').append(b);
}

function addShape(type, s) {
  counts[type] = (counts[type] || 0) + 1;
  const mesh = new THREE.Mesh(shapes[type](), new THREE.MeshStandardMaterial({ color: s ? s.color : 0x3b82f6 }));
  mesh.userData.type = type;
  mesh.userData.collide = s ? s.collide !== false : true;
  mesh.name = s ? s.name : `${type} ${counts[type]}`;
  if (s) {
    mesh.position.fromArray(s.pos);
    mesh.rotation.set(...s.rot);
    mesh.scale.fromArray(s.scale);
  } else mesh.position.set(0, type === 'Floor' ? -0.1 : 0.6, 0);
  scene.add(mesh);
  objects.push(mesh);
  if (!s) { select(mesh); changed(); }
}

// Frees the graphics memory used by a shape or an imported model.
function dispose(root) {
  root.traverse(o => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    }
  });
}

// An imported model is a Group so its parts move, turn and scale together. The group appears in the
// list straight away and the model fills in once it has loaded, so the order of things never jumps.
function addModel(path, s) {
  const project_ = project;
  const base = path.split('/').pop().replace(/\.[^.]+$/, '');
  const key = 'model:' + base;
  counts[key] = (counts[key] || 0) + 1;
  const root = new THREE.Group();
  root.userData.type = 'Model';
  root.userData.file = path;
  root.userData.collide = s ? s.collide !== false : true;
  root.name = s ? s.name : `${base} ${counts[key]}`;
  if (s) {
    root.position.fromArray(s.pos);
    root.rotation.set(...s.rot);
    root.scale.fromArray(s.scale);
  }
  scene.add(root);
  objects.push(root);
  if (!s) select(root);
  else renderList();
  // Routine progress messages must not wipe out a warning the person has not read yet.
  const loading = `Loading ${path.split('/').pop()}…`;
  if (!$('notice').classList.contains('bad')) notice(loading);

  loadProjectModel(project_.id, path).then(m => {
    if (!objects.includes(root)) { dispose(m.object); return; }   // deleted or replaced while loading
    root.add(m.object);
    if (!s) {
      // Newly added: scale it to about 2 units wide and set it on the floor, whatever units it was made in.
      const k = 2 / (Math.max(m.size.x, m.size.y, m.size.z) || 1);
      root.scale.setScalar(k);
      root.position.set(0, (m.size.y * k) / 2, 0);
      syncProps();
      changed();
    }
    const notes = [...m.warnings];
    if (m.triangles > 50000) notes.push(`${path.split('/').pop()} has ${m.triangles.toLocaleString()} triangles. That can be slow on older computers, so a lower-detail version may play better.`);
    if (notes.length) notice(notes.join(' '), true);
    else if ($('notice').textContent === loading) notice('');
  }).catch(e => {
    if (!objects.includes(root)) return;
    notice(`Could not load ${path}: ${e.message || e}`, true);
    if (!s) {   // just added by hand: take it back out rather than leave a broken thing in the scene
      if (selected === root) select(null);
      scene.remove(root);
      objects.splice(objects.indexOf(root), 1);
      renderList();
      return;
    }
    // Already in a saved scene: a red box stands in, so the scene keeps its place and nothing is lost.
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xe11d48, wireframe: true })));
  });
}

function select(obj) {
  selected = obj;
  obj ? gizmo.attach(obj) : gizmo.detach();
  renderList();
  syncProps();
}

function renderList() {
  $('list').replaceChildren(...objects.map(o => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = o.name;
    b.className = o === selected ? 'on' : '';
    b.onclick = () => select(o);
    li.append(b);
    return li;
  }));
  $('empty').hidden = objects.length > 0;
}

// --- Properties panel ---
function syncProps() {
  $('props').hidden = !selected;
  $('none').hidden = !!selected;
  if (!selected) return;
  $('p-name').value = selected.name;
  ['x', 'y', 'z'].forEach(a => ($('p-' + a).value = +selected.position[a].toFixed(2)));
  // Imported models keep their own colors, so the color picker only applies to built-in shapes.
  $('p-color').closest('label').hidden = !selected.material;
  if (selected.material) $('p-color').value = '#' + selected.material.color.getHexString();
  $('p-collide').checked = selected.userData.collide !== false;
}
$('p-name').oninput = e => { if (selected) { selected.name = e.target.value; renderList(); changed(); } };
['x', 'y', 'z'].forEach(a => ($('p-' + a).oninput = e => { if (selected) { selected.position[a] = +e.target.value || 0; changed(); } }));
$('p-collide').onchange = e => { if (selected) { selected.userData.collide = e.target.checked; changed(); } };
$('p-color').oninput = e => { if (selected && selected.material) { selected.material.color.set(e.target.value); changed(); } };

function remove() {
  if (!selected) return;
  const o = selected;
  select(null);
  scene.remove(o);
  objects.splice(objects.indexOf(o), 1);
  dispose(o);
  renderList();
  changed();
}
$('del').onclick = remove;

// --- Picking & tools ---
const ray = new THREE.Raycaster();
let down = null;
renderer.domElement.addEventListener('pointerdown', e => (down = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || gizmo.axis) return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
  // Models are groups of meshes, so look inside them and then climb back up to the thing in the list.
  let o = ray.intersectObjects(objects, true)[0]?.object;
  while (o && !objects.includes(o)) o = o.parent;
  select(o || null);
});

function setMode(m) {
  gizmo.setMode(m);
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
}
document.querySelectorAll('[data-mode]').forEach(b => (b.onclick = () => setMode(b.dataset.mode)));
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'w') setMode('translate');
  if (k === 'e') setMode('rotate');
  if (k === 'r') setMode('scale');
  if (k === 'delete' || k === 'backspace') remove();
});

// --- 3D models: import and add ---
function notice(text, bad) {
  $('notice').textContent = text;
  $('notice').classList.toggle('bad', !!bad);
}

async function refreshModels() {
  const p = project;
  const paths = p ? await listModels(p.id) : [];
  if (p !== project) return;
  $('models').replaceChildren(...paths.map(path => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = '+ ' + path.split('/').pop();
    b.title = `Add ${path} to your scene`;
    b.onclick = () => addModel(path);
    li.append(b);
    return li;
  }));
}

async function importFiles(files) {
  const p = project;
  if (!p || !files.length) return;
  notice('Importing…');
  try {
    const { models, notes, incomplete } = await importModelFiles(p.id, files);
    if (p !== project) return;
    p.fileCount = (await listFilePaths(p.id)).length;
    await saveProject(p);
    await refreshModels();
    notice(notes.join(' ') || `Imported ${models.length} model${models.length === 1 ? '' : 's'}.`, notes.length > 0);
    if (models.length === 1 && !incomplete) addModel(models[0]);   // one complete model: put it in the scene right away
  } catch (e) { notice(e.message || String(e), true); }
}
$('import-model').onclick = () => $('model-file').click();
$('model-file').onchange = e => { importFiles([...e.target.files]); e.target.value = ''; };
view.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
view.addEventListener('drop', e => { e.preventDefault(); importFiles([...e.dataTransfer.files]); });

// --- Save / load (used by the projects screen) ---
let onChange = null;
function changed() { if (onChange) onChange(getState()); }
export function getState() {
  return objects.map(o => ({
    type: o.userData.type, name: o.name, pos: o.position.toArray(),
    rot: [o.rotation.x, o.rotation.y, o.rotation.z], scale: o.scale.toArray(),
    collide: o.userData.collide !== false,
    ...(o.userData.file ? { file: o.userData.file } : { color: o.material.color.getHex() }),
  }));
}
const starter = [
  { type: 'Floor', name: 'Floor 1', pos: [0, -0.1, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: 0x9aa8b8 },
  { type: 'Cube', name: 'Cube 1', pos: [0, 0.5, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: 0x3b82f6 },
];
export function loadScene(state, callback, proj) {
  onChange = null;
  project = proj || null;
  select(null);
  for (const o of objects.splice(0)) { scene.remove(o); dispose(o); }
  for (const k in counts) delete counts[k];
  notice('');
  (state || starter).forEach(s => (s.type === 'Model' ? s.file && addModel(s.file, s) : addShape(s.type, s)));
  renderList();
  refreshModels();
  onChange = callback;
}
