import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

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
  $('p-color').value = '#' + selected.material.color.getHexString();
}
$('p-name').oninput = e => { if (selected) { selected.name = e.target.value; renderList(); changed(); } };
['x', 'y', 'z'].forEach(a => ($('p-' + a).oninput = e => { if (selected) { selected.position[a] = +e.target.value || 0; changed(); } }));
$('p-color').oninput = e => { if (selected) { selected.material.color.set(e.target.value); changed(); } };

function remove() {
  if (!selected) return;
  const o = selected;
  select(null);
  scene.remove(o);
  objects.splice(objects.indexOf(o), 1);
  o.geometry.dispose(); o.material.dispose();
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
  const hit = ray.intersectObjects(objects, false)[0];
  select(hit ? hit.object : null);
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

// --- Save / load (used by the projects screen) ---
let onChange = null;
function changed() { if (onChange) onChange(getState()); }
export function getState() {
  return objects.map(o => ({
    type: o.userData.type, name: o.name, pos: o.position.toArray(),
    rot: [o.rotation.x, o.rotation.y, o.rotation.z], scale: o.scale.toArray(),
    color: o.material.color.getHex(),
  }));
}
const starter = [
  { type: 'Floor', name: 'Floor 1', pos: [0, -0.1, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: 0x9aa8b8 },
  { type: 'Cube', name: 'Cube 1', pos: [0, 0.5, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: 0x3b82f6 },
];
export function loadScene(state, callback) {
  onChange = null;
  select(null);
  for (const o of objects.splice(0)) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
  for (const k in counts) delete counts[k];
  (state || starter).forEach(s => addShape(s.type, s));
  renderList();
  onChange = callback;
}
