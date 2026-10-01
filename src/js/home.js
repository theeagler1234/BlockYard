import { listProjects, createProject, deleteProject } from './db.js';
import { zipToProject, githubToProject } from './importers.js';

const STARTER = `// Welcome! This file is your game's code.\n// Edit it here. Your changes save on their own.\n`;

export async function renderHome(root, open) {
  root.innerHTML = `<div class="wrapper">
    <h1>Blockyard</h1>
    <p class="lead">Make a 3D game right here in your browser. Pick how you want to start.</p>
    <div class="actions">
      <div class="card"><h3>Start something new</h3><p>A blank world with a floor and a cube.</p>
        <form id="f-new"><input name="name" placeholder="Name your game" aria-label="Game name">
        <button class="primary">Create project</button></form></div>
      <div class="card drop" id="drop"><h3>Bring in your files</h3><p>Drop a .zip with your game and models, or choose one.</p>
        <input type="file" id="zip" accept=".zip" aria-label="Choose a zip file"></div>
      <div class="card"><h3>Copy from GitHub</h3><p>Paste a repository address. Large Git LFS files come along too.</p>
        <form id="f-git"><input name="url" placeholder="https://github.com/name/my-game" aria-label="GitHub address" required>
        <details><summary>Private repository?</summary>
        <input name="token" type="password" placeholder="Personal access token (not saved)" aria-label="Access token"></details>
        <button class="primary">Copy repository</button></form></div>
    </div>
    <div class="msg" role="status"></div>
    <h2>Your projects</h2><div id="plist"></div></div>`;

  const $ = s => root.querySelector(s);
  const say = (t, bad) => { const m = $('.msg'); m.textContent = t; m.className = 'msg' + (bad ? ' bad' : ''); };
  const work = async fn => {
    root.classList.add('busy');
    try { await fn(); } catch (e) { say(e.message || String(e), true); } finally { root.classList.remove('busy'); }
  };
  const imported = r => createProject(r.name, r.scene, r.files, r.extra).then(open);

  $('#f-new').onsubmit = e => {
    e.preventDefault();
    work(async () => open(await createProject(new FormData(e.target).get('name').trim() || 'Untitled game', null, { 'game.js': new Blob([STARTER]) })));
  };
  const takeZip = f => f && work(async () => { say('Reading your zip…'); await imported(await zipToProject(f)); });
  $('#zip').onchange = e => takeZip(e.target.files[0]);
  const drop = $('#drop');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); takeZip(e.dataTransfer.files[0]); };
  $('#f-git').onsubmit = e => {
    e.preventDefault();
    const d = new FormData(e.target);
    work(async () => imported(await githubToProject(d.get('url'), d.get('token').trim(), say)));
  };

  const projects = await listProjects();
  const list = $('#plist');
  if (!projects.length) list.innerHTML = '<p class="hint">No projects yet. Your games will show up here so you can pick up where you left off.</p>';
  for (const p of projects) {
    const row = document.createElement('div');
    row.className = 'card proj';
    row.innerHTML = '<div class="info"><b></b><span class="hint"></span><div class="warn" hidden></div></div>';
    row.querySelector('b').textContent = p.name;
    row.querySelector('.hint').textContent = `Edited ${new Date(p.updated).toLocaleString()} · ${p.fileCount} file${p.fileCount === 1 ? '' : 's'}`;
    if (p.lfsMissing) {
      const w = row.querySelector('.warn');
      w.hidden = false;
      w.textContent = `${p.lfsMissing} large file${p.lfsMissing === 1 ? ' was' : 's were'} not downloaded (Git LFS).`;
    }
    const go = Object.assign(document.createElement('button'), { textContent: 'Open', className: 'primary', onclick: () => open(p) });
    const del = Object.assign(document.createElement('button'), {
      textContent: 'Delete',
      onclick: () => confirm(`Delete "${p.name}"? This can't be undone.`) && work(async () => { await deleteProject(p.id); renderHome(root, open); }),
    });
    row.append(go, del);
    list.append(row);
  }
}
