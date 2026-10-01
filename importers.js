import { unzipSync } from 'fflate';

const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1';

// Zip -> { "path/in/project": Blob }, dropping junk and a single wrapping folder.
async function unpack(blob) {
  const raw = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const paths = Object.keys(raw).filter(p => !p.endsWith('/') && !p.startsWith('__MACOSX/')
    && !p.startsWith('.git/') && !p.includes('/.git/'));
  const top = paths[0]?.split('/')[0];
  const strip = paths.length && paths.every(p => p.startsWith(top + '/')) ? top.length + 1 : 0;
  const files = {};
  for (const p of paths) files[p.slice(strip)] = new Blob([raw[p]]);
  let scene = null;
  if (files['blockyard.json']) {
    try { scene = JSON.parse(await files['blockyard.json'].text()).scene ?? null; } catch {}
  }
  return { files, scene };
}

// Git LFS stores small "pointer" text files in place of big ones.
async function findPointers(files) {
  const out = [];
  for (const [p, b] of Object.entries(files)) if (b.size < 200 && (await b.text()).startsWith(LFS_POINTER)) out.push(p);
  return out;
}

export async function zipToProject(file) {
  const { files, scene } = await unpack(file);
  if (!Object.keys(files).length) throw new Error('That zip file looks empty.');
  const lfsMissing = (await findPointers(files)).length;
  return { name: file.name.replace(/\.zip$/i, ''), files, scene, extra: { lfsMissing } };
}

export async function githubToProject(input, token, say) {
  const m = input.trim().match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/tree\/([^\s?#]+))?\/?$/);
  if (!m) throw new Error('Paste a GitHub address like https://github.com/name/my-game');
  const [, owner, repo, branch] = m;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const api = path => fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, { headers });
  const fail = r => new Error(r.status === 404 ? 'Could not find that repository. If it is private, add a token.'
    : r.status === 403 || r.status === 429 ? 'GitHub is limiting requests right now. Add a token or try again later.'
    : `GitHub replied with an error (${r.status}).`);

  say('Looking up the repository…');
  let ref = branch;
  if (!ref) {
    const info = await api('');
    if (!info.ok) throw fail(info);
    ref = (await info.json()).default_branch;
  }
  say('Downloading files…');
  const zip = await api(`/zipball/${ref}`);
  if (!zip.ok) throw fail(zip);
  const { files, scene } = await unpack(await zip.blob());

  const pointers = await findPointers(files);
  let lfsMissing = 0;
  for (const [i, p] of pointers.entries()) {
    say(`Downloading large files (${i + 1} of ${pointers.length})…`);
    try {
      const url = `https://media.githubusercontent.com/media/${owner}/${repo}/${ref}/${p.split('/').map(encodeURIComponent).join('/')}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error();
      files[p] = await r.blob();
    } catch { lfsMissing++; }
  }
  return { name: repo, files, scene, extra: { lfsMissing, source: `github.com/${owner}/${repo}` } };
}
