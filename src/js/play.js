// The Play tab: runs the project's game.js in a sandboxed iframe.
// The sandbox means player code can't touch your saved projects or the editor.
import { listFilePaths, getFile } from './db.js';
import { collectModelFiles } from './modelImport.js';

const $ = id => document.getElementById(id);
const CODE = /\.m?js$/i;
const MAX_BYTES = 2_000_000;
const MAX_LINES = 200;

let frame = null, runtime = null, loaderSource = null, project = null, getScene = null;
let modelBlobs = {};   // { path: Blob } for the models in the scene, handed to the game when it asks

// "\u003c" keeps the browser from ending our <script> blocks early.
const safe = s => s.replace(/</g, '\\u003c');

async function loadRuntime() {
  if (!runtime) {
    const r = await fetch(new URL('./runtime.js', import.meta.url));
    if (!r.ok) throw new Error('Could not load the game runtime. Check your connection and try again.');
    runtime = await r.text();
  }
  return runtime;
}

// Model files live in the editor's storage, which the sandboxed game cannot reach, so the game asks for them.
async function loadLoaderSource() {
  if (!loaderSource) {
    const r = await fetch(new URL('./modelLoader.js', import.meta.url));
    if (!r.ok) throw new Error('Could not load the model reader. Check your connection and try again.');
    loaderSource = await r.text();
  }
  return loaderSource;
}

function log(level, text) {
  const out = $('playlog');
  const line = document.createElement('div');
  line.textContent = text;
  if (level === 'error') line.className = 'err';
  if (level === 'warn') line.className = 'wrn';
  out.append(line);
  while (out.childElementCount > MAX_LINES) out.firstChild.remove();
  out.scrollTop = out.scrollHeight;
}

addEventListener('message', e => {
  if (!frame || e.source !== frame.contentWindow || !e.data?.blockyard) return;
  if (e.data.type === 'log') log(e.data.level, e.data.text);
  if (e.data.type === 'need-models') frame.contentWindow.postMessage({ blockyard: true, type: 'models', files: modelBlobs }, '*');
});

export function stopPlay() {
  frame?.remove();
  frame = null;
}

async function run() {
  stopPlay();
  $('playlog').replaceChildren();
  try {
    const files = {};
    for (const p of (await listFilePaths(project.id)).filter(p => CODE.test(p))) {
      const blob = await getFile(project.id, p);
      if (blob && blob.size <= MAX_BYTES) files[p] = await blob.text();
    }
    const map = document.querySelector('script[type=importmap]').textContent;
    const scene = getScene();
    const hasModels = scene.some(s => s.file);
    modelBlobs = hasModels ? await collectModelFiles(project.id, scene) : {};
    const data = { files, scene, potato: $('potato').checked, loaderSource: hasModels ? await loadLoaderSource() : null };
    const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#dfe6ee}canvas{display:block}</style>
<script type="importmap">${map}</script></head><body>
<script type="application/json" id="blockyard-data">${safe(JSON.stringify(data))}</script>
<script type="module">${(await loadRuntime()).replace(/<\/script/gi, '<\\/script')}</script>
</body></html>`;
    frame = document.createElement('iframe');
    frame.title = 'Your game';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.onload = () => frame?.focus();
    frame.srcdoc = html;
    $('playwrap').append(frame);
  } catch (e) { log('error', e.message || String(e)); }
}

export function startPlay(p, sceneGetter) {
  project = p;
  getScene = sceneGetter;
  return run();
}

$('restart').onclick = () => project && run();
$('potato').onchange = () => project && run();
