// Projects live in IndexedDB: 'projects' holds name + scene, 'files' holds uploaded files (keyed "projectId/path").
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('blockyard', 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore('projects', { keyPath: 'id' });
    r.result.createObjectStore('files', { keyPath: 'k' });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

const run = async (stores, mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(stores, mode);
    const req = fn(...stores.map(s => t.objectStore(s)));
    t.oncomplete = () => res(req && req.result);
    t.onerror = t.onabort = () => rej(new Error(t.error?.name === 'QuotaExceededError'
      ? 'Your browser is out of storage space for this project.' : 'Could not save to your browser storage.'));
  });
};

export const listProjects = () =>
  run(['projects'], 'readonly', p => p.getAll()).then(a => a.sort((x, y) => y.updated - x.updated));
export const saveProject = p => { p.updated = Date.now(); return run(['projects'], 'readwrite', s => s.put(p)); };
export const createProject = (name, scene = null, files = {}, extra = {}) => {
  const p = { id: crypto.randomUUID(), name, scene, fileCount: Object.keys(files).length, updated: Date.now(), ...extra };
  return run(['projects', 'files'], 'readwrite', (ps, fs) => {
    for (const [path, blob] of Object.entries(files)) fs.put({ k: `${p.id}/${path}`, blob });
    return ps.put(p);
  }).then(() => p);
};
export const deleteProject = id =>
  run(['projects', 'files'], 'readwrite', (ps, fs) => { fs.delete(IDBKeyRange.bound(id + '/', id + '0')); return ps.delete(id); });

const range = pid => IDBKeyRange.bound(pid + '/', pid + '0');
export const listFilePaths = pid =>
  run(['files'], 'readonly', f => f.getAllKeys(range(pid))).then(ks => ks.map(k => k.slice(pid.length + 1)).sort());
export const getFile = (pid, path) => run(['files'], 'readonly', f => f.get(`${pid}/${path}`)).then(r => r && r.blob);
export const putFile = (pid, path, blob) => run(['files'], 'readwrite', f => f.put({ k: `${pid}/${path}`, blob }));
export const deleteFile = (pid, path) => run(['files'], 'readwrite', f => f.delete(`${pid}/${path}`));
