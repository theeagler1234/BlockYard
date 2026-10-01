// The game runtime. play.js embeds this file in a sandboxed iframe, so it can't import
// other project files by path. Everything the player's code can touch is built here.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const data = JSON.parse(document.getElementById('blockyard-data').textContent);
const post = (type, extra) => parent.postMessage({ blockyard: true, type, ...extra }, '*');
const show = v => {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
};

// --- Send console output and errors to the Play tab ---
for (const level of ['log', 'info', 'warn', 'error']) {
  const original = console[level];
  console[level] = (...args) => {
    original.apply(console, args);
    post('log', { level, text: args.map(show).join(' ') });
  };
}
const fail = text => post('log', { level: 'error', text });
addEventListener('error', e => fail(e.message || 'Something went wrong in your code.'));
addEventListener('unhandledrejection', e => fail(String(e.reason?.message || e.reason)));

// --- Renderer, scene, camera ---
// Potato mode trades sharpness for speed: no antialiasing and a smaller picture stretched to fit.
const renderer = new THREE.WebGLRenderer({ antialias: !data.potato });
renderer.setPixelRatio(data.potato ? 0.6 : Math.min(devicePixelRatio, 2));
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe6ee);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(5, 10, 4);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
camera.position.set(6, 5, 8);
const controls = new OrbitControls(camera, renderer.domElement);
const resize = () => {
  renderer.setSize(innerWidth, innerHeight);
  if (data.potato) renderer.domElement.style.cssText = 'width:100%;height:100%';
  camera.aspect = innerWidth / Math.max(innerHeight, 1);
  camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();

// --- Things: the beginner-friendly wrapper around a mesh ---
// Keep these shapes in sync with src/js/main.js.
const shapes = {
  Cube: () => new THREE.BoxGeometry(1, 1, 1),
  Sphere: () => new THREE.SphereGeometry(0.6, 32, 16),
  Cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  Cone: () => new THREE.ConeGeometry(0.6, 1.2, 32),
  Floor: () => new THREE.BoxGeometry(6, 0.2, 6),
};

class Thing {
  constructor(mesh) { this.mesh = mesh; }
  get name() { return this.mesh.name; }
  set name(v) { this.mesh.name = v; }
  get position() { return this.mesh.position; }
  get rotation() { return this.mesh.rotation; } // in radians
  get scale() { return this.mesh.scale; }
  get color() { return '#' + this.mesh.material.color.getHexString(); }
  set color(v) { this.mesh.material.color.set(v); }
  get visible() { return this.mesh.visible; }
  set visible(v) { this.mesh.visible = !!v; }
  move(x = 0, y = 0, z = 0) { this.mesh.position.x += x; this.mesh.position.y += y; this.mesh.position.z += z; return this; }
  rotate(x = 0, y = 0, z = 0) { this.mesh.rotation.x += x; this.mesh.rotation.y += y; this.mesh.rotation.z += z; return this; }
  remove() {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    const i = things.indexOf(this);
    if (i >= 0) things.splice(i, 1);
  }
}

const things = [];
function makeThing(type, o = {}) {
  if (!shapes[type]) throw new Error(`Unknown shape "${type}". Try: ${Object.keys(shapes).join(', ')}.`);
  const mesh = new THREE.Mesh(shapes[type](), new THREE.MeshStandardMaterial({ color: o.color ?? 0x3b82f6 }));
  mesh.name = o.name ?? type;
  mesh.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  scene.add(mesh);
  const t = new Thing(mesh);
  things.push(t);
  return t;
}
for (const s of data.scene || []) {
  const t = makeThing(s.type, { name: s.name, color: s.color });
  t.mesh.position.fromArray(s.pos);
  t.mesh.rotation.set(...s.rot);
  t.mesh.scale.fromArray(s.scale);
}

// --- Keyboard ---
const alias = { space: ' ', left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown', esc: 'escape' };
const norm = k => { k = String(k).toLowerCase(); return alias[k] ?? k; };
const held = new Set(), tapped = new Set();
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!held.has(k)) tapped.add(k);
  held.add(k);
  if (k.startsWith('arrow') || k === ' ') e.preventDefault();
});
addEventListener('keyup', e => held.delete(e.key.toLowerCase()));
addEventListener('blur', () => held.clear());

// --- The game object your code receives ---
const game = {
  THREE, scene, camera, renderer,
  orbit: true,   // set to false to stop the mouse from moving the camera
  time: 0,       // seconds since the game started
  things,
  find: name => things.find(t => t.name === name) ?? null,
  add: (type, options) => makeThing(type, options),
  keys: { down: k => held.has(norm(k)), pressed: k => tapped.has(norm(k)) },
};
window.game = game;

// --- Load the project's code ---
// Files can import each other with relative paths. We rewrite those imports to blob URLs.
const files = data.files;
const urls = new Map(), chain = [];
const resolve = (from, spec) => {
  const out = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '' || seg === '.') continue;
    seg === '..' ? out.pop() : out.push(seg);
  }
  const path = out.join('/');
  return path in files ? path : path + '.js' in files ? path + '.js' : null;
};
function urlFor(path) {
  if (urls.has(path)) return urls.get(path);
  if (chain.includes(path)) throw new Error(`These files import each other in a circle: ${[...chain, path].join(' → ')}`);
  chain.push(path);
  const code = files[path].replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]*)\2/g, (m, pre, q, spec) => {
    const target = resolve(path, spec);
    if (!target) throw new Error(`${path} imports "${spec}", but that file doesn't exist.`);
    return pre + q + urlFor(target) + q;
  });
  chain.pop();
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  urls.set(path, url);
  return url;
}

let update = null;
try {
  if (!('game.js' in files)) console.warn('There is no game.js yet. Add one in the Code tab to make things move.');
  else {
    const mod = await import(urlFor('game.js'));
    mod.start?.(game);
    if (typeof mod.update === 'function') update = mod.update;
  }
} catch (e) { fail(e.message || String(e)); }

// --- Run ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  game.time += dt;
  if (update) {
    try { update(dt, game); } catch (e) {
      fail(`update() stopped because of an error: ${e.message}. Fix it, then press Restart.`);
      update = null;
    }
  }
  controls.enabled = game.orbit;
  if (game.orbit) controls.update();
  renderer.render(scene, camera);
  tapped.clear();
});
post('ready');
