// The Play tab: runs the project's game.js in a sandboxed iframe.
// The sandbox means player code can't touch your saved projects or the editor.
import { listFilePaths, getFile } from './db.js';

const $ = id => document.getElementById(id);
const CODE = /\.m?js$/i;
const MAX_BYTES = 2_000_000;
const MAX_LINES = 200;

let frame = null, runtime = null, project = null, getScene = null;

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
    const data = { files, scene: getScene(), potato: $('potato').checked };
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
