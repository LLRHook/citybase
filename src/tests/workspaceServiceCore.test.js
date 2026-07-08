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
