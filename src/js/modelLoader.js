// Loads .glb / .gltf / .obj models from a Map of { "path/in/project": Blob }.
//
// This file is used in two places: the editor imports it, and play.js sends its text into the
// sandboxed game frame, where runtime.js imports it from a blob URL. Because of that it must stay
// self-contained: bare imports only ('three' and 'three/addons/...'), no relative imports.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

const FAKE_ROOT = 'blockyard-file:/';   // loaders resolve relative links against this; we map them back to blobs
const IMAGE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const SKIP = /^(data:|blob:|https?:|\/\/)/i;

const extOf = p => (p.match(/\.([^./]+)$/) || [])[1]?.toLowerCase() || '';
const dirOf = p => p.slice(0, p.lastIndexOf('/') + 1);
const baseOf = p => p.split(/[\\/]/).pop().toLowerCase();

// Turns a link written inside a model file ("tex/wood.png") into a project path, or null.
// Tries the exact spot first, then falls back to the same file name anywhere in `files`,
// because people often upload everything into one flat folder.
export function findFile(dir, link, files) {
  let uri = link.split(/[?#]/)[0];
  try { uri = decodeURIComponent(uri); } catch {}
  uri = uri.replace(/\\/g, '/');
  const out = dir.split('/').filter(Boolean);
  for (const seg of uri.split('/')) {
    if (!seg || seg === '.') continue;
    seg === '..' ? out.pop() : out.push(seg);
  }
  const exact = out.join('/');
  if (files.has(exact)) return exact;
  const name = baseOf(uri);
  let other = null;
  for (const p of files.keys()) {
    if (baseOf(p) !== name) continue;
    if (p.startsWith(dir)) return p;
    other ??= p;
  }
  return other;
}

// Which project files does this model need? `paths` is every path in the project and
// `read(path)` returns that file's Blob. Returns { files: [paths to load], missing: [links not found] }.
export async function dependencies(path, paths, read) {
  const known = new Map(paths.map(p => [p, true]));
  const files = new Set([path]), missing = [];
  const want = (from, link) => {
    if (!link || SKIP.test(link)) return null;
    const hit = findFile(dirOf(from), link, known);
    if (hit) files.add(hit); else missing.push(link.split(/[?#]/)[0]);
    return hit;
  };
  const main = await read(path);
  if (!main) throw new Error(`${path} is missing from this project.`);
  const ext = extOf(path);
  if (ext === 'gltf') {
    let json;
    try { json = JSON.parse(await main.text()); } catch { throw new Error(`${path} is not a valid .gltf file.`); }
    for (const x of [...(json.buffers || []), ...(json.images || [])]) want(path, x.uri);
  } else if (ext === 'obj') {
    for (const m of (await main.text()).matchAll(/^mtllib\s+(.+?)\s*$/gm)) {
      const mtl = want(path, m[1]);
      const blob = mtl && await read(mtl);
      if (!blob) continue;
      // Texture lines look like "map_Kd -s 1 1 1 wood.png": the file name is the last word.
      for (const t of (await blob.text()).matchAll(/^\s*(?:map_\w+|bump|disp|decal|refl)\s+(.+?)\s*$/gim)) {
        want(mtl, t[1].split(/\s+/).pop());
      }
    }
  }
  return { files: [...files], missing: [...new Set(missing)] };
}

let pixel = null;   // stand-in for textures that are missing, so one bad picture doesn't lose the whole model
const blankImage = () => (pixel ??= (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  return c.toDataURL();
})());

function countTriangles(root) {
  let n = 0;
  root.traverse(o => {
    const g = o.isMesh && o.geometry;
    if (g) n += (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
  });
  return Math.round(n);
}

// Loads one model. `files` must contain the model and everything dependencies() listed.
// Returns { object, size, triangles, warnings }:
//   object  - a Group holding the model, moved so the middle of its bounding box sits at (0,0,0)
//   size    - the model's width/height/depth in its own units
// Centering matters: physics treats every thing as a box centered on its position.
export async function loadModel(path, files) {
  const ext = extOf(path);
  const dir = dirOf(path);
  const warnings = [], urls = new Map();
  let requested = 0;   // how many linked files (textures) the loaders asked for
  const urlFor = p => {
    if (!urls.has(p)) urls.set(p, URL.createObjectURL(files.get(p)));
    return urls.get(p);
  };

  const manager = new THREE.LoadingManager();
  let onIdle = null;
  manager.onLoad = () => onIdle?.();
  manager.setURLModifier(u => {
    if (!u.startsWith(FAKE_ROOT)) return u;
    requested++;
    const link = u.slice(FAKE_ROOT.length);
    const hit = findFile('', link, files);
    if (hit) return urlFor(hit);
    let name = link.split('/').pop();
    try { name = decodeURIComponent(name); } catch {}
    warnings.push(`${name} was not found${IMAGE.test(name) ? ', so that part will look blank' : ''}.`);
    return IMAGE.test(name) ? blankImage() : u;
  });

  let object;
  try {
    const blob = files.get(path);
    if (!blob) throw new Error('the file is missing');
    if (ext === 'glb' || ext === 'gltf') {
      const data = ext === 'glb' ? await blob.arrayBuffer() : await blob.text();
      object = (await new GLTFLoader(manager).parseAsync(data, FAKE_ROOT + dir)).scene;
    } else if (ext === 'obj') {
      const loader = new OBJLoader(manager);
      const text = await blob.text();
      const mtlLink = text.match(/^mtllib\s+(.+?)\s*$/m)?.[1];
      const mtlPath = mtlLink && findFile(dir, mtlLink, files);
      if (mtlPath) {
        const mtl = new MTLLoader(manager).parse(await files.get(mtlPath).text(), FAKE_ROOT + dirOf(mtlPath));
        mtl.preload();
        loader.setMaterials(mtl);
      }
      object = loader.parse(text);
      if (!mtlPath) {   // plain grey, so an .obj without colors still looks like something
        const grey = new THREE.MeshStandardMaterial({ color: 0xb8c0cc });
        object.traverse(o => { if (o.isMesh) o.material = grey; });
      }
      // MTL textures load after parse() returns, so wait for them before letting go of their blob URLs.
      if (requested) await new Promise(res => { onIdle = res; setTimeout(res, 10000); });
    } else throw new Error(`.${ext} files are not supported. Use .glb, .gltf or .obj.`);
  } catch (e) {
    // If a linked file was not found, that is the real reason, so say so instead of the loader's wording.
    if (warnings.length) throw new Error(warnings.join(' '));
    const detail = String(e.message || e);
    throw new Error(/Draco|KTX2|meshopt/i.test(detail)
      ? 'this model uses compression Blockyard cannot read yet. Re-export it without Draco/KTX2/Meshopt.' : detail);
  } finally {
    urls.forEach(u => URL.revokeObjectURL(u));
  }

  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) throw new Error('there is nothing to show in this file.');
  const size = box.getSize(new THREE.Vector3());
  object.position.sub(box.getCenter(new THREE.Vector3()));
  const holder = new THREE.Group();
  holder.add(object);
  return { object: holder, size, triangles: countTriangles(holder), warnings: [...new Set(warnings)] };
}
