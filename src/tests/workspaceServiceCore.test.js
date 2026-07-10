// workspaceServiceCore — the pure workspace registry factory (FEAT-022).
// Guards the extraction: register/pick/current flows against an injected fs,
// no Electron anywhere.
import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceService } from '../../electron/main/services/workspaceServiceCore.cjs';

function makeFakeFs({ dirs = [], files = {} } = {}) {
  const store = new Map(Object.entries(files));
  const dirSet = new Set(dirs);
  return {
    store,
    readFile: vi.fn(async (p) => {
      if (!store.has(p)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return store.get(p);
    }),
    writeFile: vi.fn(async (p, data) => { store.set(p, data); }),
    rename: vi.fn(async (from, to) => {
      if (!store.has(from)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      store.set(to, store.get(from));
      store.delete(from);
    }),
    mkdir: vi.fn(async () => {}),
    realpath: vi.fn(async (p) => {
      if (!dirSet.has(p) && !store.has(p)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return p;
    }),
    stat: vi.fn(async (p) => ({ isDirectory: () => dirSet.has(p) })),
  };
}

const OPTS = { getUserDataDir: () => '/data' };

describe('createWorkspaceService — registerWorkspacePath', () => {
  it('validates, persists, and returns the workspace for a real directory', async () => {
    const fs = makeFakeFs({ dirs: ['/repo/alpha'] });
    const svc = createWorkspaceService({ ...OPTS, fs, now: () => 'T0' });
    const ws = await svc.registerWorkspacePath('/repo/alpha');
    expect(ws).toMatchObject({ name: 'alpha', rootPath: '/repo/alpha', openedAt: 'T0' });
    expect(await svc.getCurrentWorkspace()).toMatchObject({ id: ws.id });
    expect(await svc.getWorkspaceById(ws.id)).toMatchObject({ rootPath: '/repo/alpha' });
  });

  it('rejects a file path and a missing path', async () => {
    const fs = makeFakeFs({ dirs: [], files: { '/repo/file.txt': 'x' } });
    const svc = createWorkspaceService({ ...OPTS, fs });
    await expect(svc.registerWorkspacePath('/repo/file.txt')).rejects.toThrow(/not a directory/);
    await expect(svc.registerWorkspacePath('/nope')).rejects.toThrow();
    await expect(svc.registerWorkspacePath('')).rejects.toThrow(TypeError);
  });

  it('re-registering the same path keeps openedAt and moves it to the front', async () => {
    const fs = makeFakeFs({ dirs: ['/a', '/b'] });
    let t = 0;
    const svc = createWorkspaceService({ ...OPTS, fs, now: () => `T${t++}` });
    await svc.registerWorkspacePath('/a');
    await svc.registerWorkspacePath('/b');
    const again = await svc.registerWorkspacePath('/a');
    expect(again.openedAt).toBe('T0');
    expect(again.lastOpenedAt).toBe('T2');
    const recents = await svc.listRecentWorkspaces();
    expect(recents.map((w) => w.rootPath)).toEqual(['/a', '/b']);
  });
});

describe('createWorkspaceService — atomic, serialized writes (BUG-013)', () => {
  it('writes through a temp file and renames into place', async () => {
    const fs = makeFakeFs({ dirs: ['/a'] });
    const svc = createWorkspaceService({ ...OPTS, fs });
    await svc.registerWorkspacePath('/a');
    expect(fs.rename).toHaveBeenCalledWith('/data/workspaces.json.tmp', '/data/workspaces.json');
    expect(fs.store.has('/data/workspaces.json.tmp')).toBe(false);
    expect(JSON.parse(fs.store.get('/data/workspaces.json')).workspaces).toHaveLength(1);
  });

  it('concurrent mutations do not lose updates (read-modify-write is serialized)', async () => {
    // Make reads slow so unserialized mutations would interleave: both would
    // read the empty state and the second write would drop the first entry.
    const fs = makeFakeFs({ dirs: ['/a', '/b'] });
    const realRead = fs.readFile.getMockImplementation();
    fs.readFile.mockImplementation(async (p) => {
      await new Promise((r) => setTimeout(r, 5));
      return realRead(p);
    });
    const svc = createWorkspaceService({ ...OPTS, fs });
    await Promise.all([
      svc.registerWorkspacePath('/a'),
      svc.registerWorkspacePath('/b'),
    ]);
    const recents = await svc.listRecentWorkspaces();
    expect(recents.map((w) => w.rootPath).sort()).toEqual(['/a', '/b']);
  });

  it('a failed write does not stall later mutations', async () => {
    const fs = makeFakeFs({ dirs: ['/a', '/b'] });
    fs.writeFile.mockRejectedValueOnce(new Error('disk full'));
    const svc = createWorkspaceService({ ...OPTS, fs });
    await expect(svc.registerWorkspacePath('/a')).rejects.toThrow('disk full');
    const ws = await svc.registerWorkspacePath('/b');
    expect(ws.rootPath).toBe('/b');
  });
});

describe('createWorkspaceService — headless mode', () => {
  it('pickWorkspace throws a clear error when no dialog is injected', async () => {
    const svc = createWorkspaceService({ ...OPTS, fs: makeFakeFs() });
    await expect(svc.pickWorkspace()).rejects.toThrow(/headless.*registerPath/);
  });

  it('pickWorkspace registers the dialog result when a dialog is injected', async () => {
    const fs = makeFakeFs({ dirs: ['/picked'] });
    const svc = createWorkspaceService({
      ...OPTS, fs, showOpenDialog: vi.fn(async () => '/picked'),
    });
    const ws = await svc.pickWorkspace();
    expect(ws).toMatchObject({ rootPath: '/picked' });
  });

  it('pickWorkspace returns null on dialog cancel', async () => {
    const svc = createWorkspaceService({
      ...OPTS, fs: makeFakeFs(), showOpenDialog: vi.fn(async () => null),
    });
    expect(await svc.pickWorkspace()).toBeNull();
  });
});
