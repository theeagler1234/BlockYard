// The Code tab: Monaco (VS Code's editor engine) + a simple file list. Files live in IndexedDB.
import { listFilePaths, getFile, putFile, deleteFile, saveProject } from './db.js';

const BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min';
const TEXT = /\.(js|mjs|ts|json|html?|css|txt|md|gltf|mtl|obj|glsl|vert|frag|ya?ml)$/i;
const MAX_BYTES = 2_000_000;
const $ = id => document.getElementById(id);

let monacoPromise, monaco, editor, project, paths = [], current = null;
let say = () => {}, timer = null;
const models = new Map();
const dirty = new Map();

function loadMonaco() {
  return (monacoPromise ??= new Promise((res, rej) => {
    // Monaco's workers must be loaded from a same-origin blob when the files come from a CDN.
    window.MonacoEnvironment = {
      getWorkerUrl: () => URL.createObjectURL(new Blob(
        [`self.MonacoEnvironment={baseUrl:'${BASE}/'};importScripts('${BASE}/vs/base/worker/workerMain.js');`],
        { type: 'text/javascript' })),
    };
    const s = document.createElement('script');
    s.src = BASE + '/vs/loader.js';
    s.onerror = () => { monacoPromise = null; rej(new Error('Could not load the code editor. Check your connection and try again.')); };
    s.onload = () => {
      window.require.config({ paths: { vs: BASE + '/vs' } });
      window.require(['vs/editor/editor.main'], () => res(window.monaco), rej);
    };
    document.head.append(s);
  }));
}

export async function flushCode() {
  clearTimeout(timer);
  timer = null;
  const jobs = [...dirty];
  dirty.clear();
  if (!jobs.length) return;
  try {
    for (const [p, m] of jobs) await putFile(project.id, p, new Blob([m.getValue()]));
    say('Saved');
  } catch (e) { say(e.message); }
}

function queueSave(path, model) {
  dirty.set(path, model);
  say('Saving…');
  clearTimeout(timer);
  timer = setTimeout(flushCode, 600);
}

function renderTree() {
  $('tree').replaceChildren(...paths.map(p => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    const i = p.lastIndexOf('/');
    b.textContent = p.slice(i + 1);
    b.title = p;
    if (i > 0) {
      const d = document.createElement('span');
      d.className = 'hint';
      d.textContent = ' ' + p.slice(0, i);
      b.append(d);
    }
    if (p === current) b.className = 'on';
    b.onclick = () => openFile(p);
    li.append(b);
    return li;
  }));
}

async function openFile(path) {
  current = path;
  renderTree();
  const note = $('ide-note');
  note.textContent = '';
  let model = models.get(path);
  if (!model) {
    const blob = await getFile(project.id, path);
    if (!TEXT.test(path) || !blob || blob.size > MAX_BYTES) {
      editor.setModel(null);
      note.textContent = `${path} is a model, image, or large file, so it can't be edited here.`;
      return;
    }
    model = monaco.editor.createModel(await blob.text(), undefined, monaco.Uri.file('/' + path));
    model.onDidChangeContent(() => queueSave(path, model));
    models.set(path, model);
  }
  editor.setModel(model);
}

export async function openCode(p, setStatus) {
  say = setStatus;
  try {
    const mon = (monaco = await loadMonaco());
    if (!editor) {
      const dark = matchMedia('(prefers-color-scheme: dark)');
      editor = mon.editor.create($('monaco'), {
        automaticLayout: true, minimap: { enabled: false }, fontSize: 14, tabSize: 2,
        scrollBeyondLastLine: false, theme: dark.matches ? 'vs-dark' : 'vs',
      });
      dark.onchange = e => mon.editor.setTheme(e.matches ? 'vs-dark' : 'vs');
    }
    if (!project || project.id !== p.id) {
      await flushCode();
      models.forEach(m => m.dispose());
      models.clear();
      editor.setModel(null);
      project = p;
      current = null;
      paths = await listFilePaths(p.id);
      renderTree();
      const first = paths.find(x => x === 'game.js') || paths.find(x => TEXT.test(x));
      if (first) await openFile(first);
      else $('ide-note').textContent = 'No files yet. Choose New file to make your first one.';
    }
    editor.layout();
    editor.focus();
  } catch (e) { $('ide-note').textContent = e.message; }
}

$('newfile').onclick = async () => {
  if (!project || !editor) return;
  const name = (prompt('Name your file, for example game.js or scripts/player.js') || '').trim().replace(/^\/+/, '');
  if (!name) return;
  if (!paths.includes(name)) {
    await putFile(project.id, name, new Blob(['']));
    paths = [...paths, name].sort();
    project.fileCount = paths.length;
    await saveProject(project);
  }
  await openFile(name);
};

$('delfile').onclick = async () => {
  if (!project || !current || !confirm(`Delete "${current}"? This can't be undone.`)) return;
  dirty.delete(current);
  models.get(current)?.dispose();
  models.delete(current);
  await deleteFile(project.id, current);
  paths = paths.filter(p => p !== current);
  project.fileCount = paths.length;
  await saveProject(project);
  current = null;
  editor.setModel(null);
  renderTree();
};

$('copilot').onclick = () => {
  const repo = project?.source?.replace('github.com/', '');
  if (repo) window.open(`https://github.dev/${repo}`, '_blank', 'noopener');
  else {
    window.open('https://vscode.dev', '_blank', 'noopener');
    $('ide-note').textContent = 'Copilot works once your project is on GitHub. Publishing from Blockyard is coming in a later step.';
  }
};
