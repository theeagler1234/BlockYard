// Editor-side model helpers: saving uploaded model files into the project and reading them back.
// The three.js loaders are imported lazily, so projects without models never download them.
import { unzipSync } from 'fflate';
import { listFilePaths, getFile, putFile } from './db.js';

const MODEL = /\.(glb|gltf|obj)$/i;
// A model can come with extra files: .bin data for .gltf, .mtl colors for .obj, and pictures.
const PART = /\.(glb|gltf|obj|mtl|bin|png|jpe?g|webp|gif|bmp)$/i;
const MAX_BYTES = 100_000_000;
const loader = () => import('./modelLoader.js');

export const isModelPath = p => MODEL.test(p);
export const listModels = async pid => (await listFilePaths(pid)).filter(isModelPath);

// Reads a model and everything it needs from the project, then loads it.
// Resolves to { object, size, triangles, warnings }.
export async function loadProjectModel(pid, path) {
  const [{ dependencies, loadModel }, paths] = await Promise.all([loader(), listFilePaths(pid)]);
  const read = p => getFile(pid, p);
  const { files } = await dependencies(path, paths, read);
  const blobs = new Map();
  for (const p of files) blobs.set(p, await read(p));
  return loadModel(path, blobs);
}

// Everything the Play tab must hand to the sandboxed game: { path: Blob } for every model in `scene`.
export async function collectModelFiles(pid, scene) {
  const out = {};
  const wanted = [...new Set(scene.filter(s => s.file).map(s => s.file))];
  if (!wanted.length) return out;
  const [{ dependencies }, paths] = await Promise.all([loader(), listFilePaths(pid)]);
  const read = p => getFile(pid, p);
  for (const file of wanted) {
    try {
      for (const p of (await dependencies(file, paths, read)).files) {
        if (!out[p]) { const b = await read(p); if (b) out[p] = b; }
      }
    } catch { /* the game reports that this model could not load */ }
  }
  return out;
}

// Saves picked files (or a .zip) under models/ in the project.
// Resolves to { models: [paths], notes: [things the person should know], incomplete: some model is missing files }.
export async function importModelFiles(pid, picked) {
  const incoming = {};
  const ignored = [];
  for (const f of picked) {
    if (f.size > MAX_BYTES) throw new Error(`${f.name} is bigger than ${MAX_BYTES / 1e6} MB. Try a smaller or lower-detail version.`);
    if (/\.zip$/i.test(f.name)) {
      const folder = f.name.replace(/\.zip$/i, '');
      let raw;
      try {
        raw = unzipSync(new Uint8Array(await f.arrayBuffer()),
          { filter: z => !z.name.endsWith('/') && !z.name.startsWith('__MACOSX/') && PART.test(z.name) });
      } catch { throw new Error(`Could not open ${f.name}. Is it a valid zip file?`); }
      for (const [name, bytes] of Object.entries(raw)) incoming[`models/${folder}/${name}`] = new Blob([bytes]);
    } else if (PART.test(f.name)) incoming[`models/${f.name}`] = f;
    else ignored.push(f.name);
  }
  const models = Object.keys(incoming).filter(isModelPath);
  if (!models.length) {
    throw new Error('Pick a .glb, .gltf or .obj file. If it comes with extra files (.bin, .mtl, pictures), pick them all together, or use a .zip.');
  }
  for (const [path, blob] of Object.entries(incoming)) await putFile(pid, path, blob);

  const notes = [];
  let incomplete = false;
  if (ignored.length) notes.push(`Skipped ${ignored.join(', ')} (not a model file).`);
  // Tell the person right away if a model points at files that were not uploaded.
  const paths = await listFilePaths(pid);
  const { dependencies } = await loader();
  for (const path of models) {
    try {
      const { missing } = await dependencies(path, paths, p => getFile(pid, p));
      if (missing.length) incomplete = true;
      if (missing.length) notes.push(`${path.split('/').pop()} also needs ${missing.join(', ')}. Import ${missing.length > 1 ? 'those files' : 'that file'} too.`);
    } catch (e) { incomplete = true; notes.push(e.message); }
  }
  return { models, notes, incomplete };
}
