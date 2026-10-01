import { loadScene } from './main.js';
import { saveProject } from './db.js';
import { renderHome } from './home.js';
import { openCode, flushCode } from './code.js';

const $ = id => document.getElementById(id);
let current = null, timer = null, tab = 'scene';

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

async function showTab(name) {
  if (tab === 'code' && name !== 'code') await flushCode();
  tab = name;
  document.querySelectorAll('.tab[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelector('main').hidden = name !== 'scene';
  $('code').hidden = name !== 'code';
  if (name === 'code') openCode(current, t => ($('saved').textContent = t));
}
document.querySelectorAll('.tab[data-tab]').forEach(b => (b.onclick = () => showTab(b.dataset.tab)));

function open(project) {
  current = project;
  $('home').hidden = true;
  $('editor').hidden = false;
  $('pname').textContent = project.name;
  $('saved').textContent = '';
  showTab('scene');
  loadScene(project.scene, autosave);
}

async function showHome() {
  await flushCode();
  await flush();
  current = null;
  $('editor').hidden = true;
  $('home').hidden = false;
  await renderHome($('home'), open);
}

$('back').onclick = showHome;
showHome();
