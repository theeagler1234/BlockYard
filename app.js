import { loadScene } from './main.js';
import { saveProject } from './db.js';
import { renderHome } from './home.js';

const $ = id => document.getElementById(id);
let current = null, timer = null;

function autosave(state) {
  current.scene = state;
  $('saved').textContent = 'Saving…';
  clearTimeout(timer);
  timer = setTimeout(flush, 600);
}
async function flush() {
  clearTimeout(timer);
  timer = null;
  if (!current) return;
  try { await saveProject(current); $('saved').textContent = 'Saved'; }
  catch (e) { $('saved').textContent = e.message; }
}

function open(project) {
  current = project;
  $('home').hidden = true;
  $('editor').hidden = false;
  $('pname').textContent = project.name;
  $('saved').textContent = '';
  loadScene(project.scene, autosave);
}

async function showHome() {
  await flush();
  current = null;
  $('editor').hidden = true;
  $('home').hidden = false;
  await renderHome($('home'), open);
}

$('back').onclick = showHome;
showHome();
