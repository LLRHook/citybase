import { describe, expect, it, vi } from 'vitest';
import { createIpcHandlers } from '../../electron/main/ipcHandlers.cjs';

function makeStubs(overrides = {}) {
  const app = { getVersion: () => '0.1.0', ...(overrides.app || {}) };
  const fakeWindow = overrides.fakeWindow ?? Symbol('main-window');
  const getMainWindow = overrides.getMainWindow ?? (() => fakeWindow);
  const workspaceService = {
    pickWorkspace: vi.fn(async () => ({ id: 'ws-1', rootPath: '/repo' })),
    getCurrentWorkspace: vi.fn(async () => ({ id: 'ws-1' })),
    setCurrentWorkspace: vi.fn(async (id) => ({ id })),
    listRecentWorkspaces: vi.fn(async () => [{ id: 'ws-1' }]),
    forgetWorkspace: vi.fn(async () => undefined),
    getWorkspaceById: vi.fn(async (id) => (id === 'ws-1' ? { id, rootPath: '/repo' } : null)),
    ...(overrides.workspaceService || {}),
  };
  const gitService = {
    getSnapshot: vi.fn(async (ws) => ({ workspaceId: ws.id, branch: 'main' })),
    ...(overrides.gitService || {}),
  };
  return { app, workspaceService, gitService, getMainWindow, fakeWindow };
}

describe('createIpcHandlers', () => {
  it('throws if any required dependency is missing', () => {
    expect(() => createIpcHandlers({})).toThrow(/app/);
    expect(() => createIpcHandlers({ app: { getVersion: () => '0' } })).toThrow(/workspaceService/);
    expect(() => createIpcHandlers({ app: { getVersion: () => '0' }, workspaceService: {} })).toThrow(/gitService/);
    expect(() => createIpcHandlers({
      app: { getVersion: () => '0' }, workspaceService: {}, gitService: {},
    })).toThrow(/getMainWindow/);
  });

  it('exposes the full set of citybase: channels', () => {
    const handlers = createIpcHandlers(makeStubs());
    expect(Object.keys(handlers).sort()).toEqual([
      'citybase:app.getPlatform',
      'citybase:app.getVersion',
      'citybase:git.getSnapshot',
      'citybase:git.refresh',
      'citybase:workspace.forget',
      'citybase:workspace.getCurrent',
      'citybase:workspace.listRecent',
      'citybase:workspace.pick',
      'citybase:workspace.setCurrent',
    ]);
  });

  it('app.getVersion delegates to app.getVersion', () => {
    const stubs = makeStubs({ app: { getVersion: () => '9.9.9' } });
    const handlers = createIpcHandlers(stubs);
    expect(handlers['citybase:app.getVersion']()).toBe('9.9.9');
  });

  it('app.getPlatform returns the live process.platform', () => {
    const handlers = createIpcHandlers(makeStubs());
    expect(handlers['citybase:app.getPlatform']()).toBe(process.platform);
  });

  it('workspace.pick passes the main window into pickWorkspace', async () => {
    const stubs = makeStubs();
    const handlers = createIpcHandlers(stubs);
    await handlers['citybase:workspace.pick']();
    expect(stubs.workspaceService.pickWorkspace).toHaveBeenCalledWith({ window: stubs.fakeWindow });
  });

  it('workspace.getCurrent / listRecent forward without arguments', async () => {
    const stubs = makeStubs();
    const handlers = createIpcHandlers(stubs);
    await handlers['citybase:workspace.getCurrent']();
    await handlers['citybase:workspace.listRecent']();
    expect(stubs.workspaceService.getCurrentWorkspace).toHaveBeenCalledTimes(1);
    expect(stubs.workspaceService.listRecentWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('workspace.setCurrent / forget forward the id from the renderer event tuple', async () => {
    const stubs = makeStubs();
    const handlers = createIpcHandlers(stubs);
    await handlers['citybase:workspace.setCurrent'](null, 'ws-42');
    await handlers['citybase:workspace.forget'](null, 'ws-42');
    expect(stubs.workspaceService.setCurrentWorkspace).toHaveBeenCalledWith('ws-42');
    expect(stubs.workspaceService.forgetWorkspace).toHaveBeenCalledWith('ws-42');
  });

  it('git.getSnapshot looks up the workspace, then calls gitService.getSnapshot', async () => {
    const stubs = makeStubs();
    const handlers = createIpcHandlers(stubs);
    const out = await handlers['citybase:git.getSnapshot'](null, 'ws-1');
    expect(stubs.workspaceService.getWorkspaceById).toHaveBeenCalledWith('ws-1');
    expect(stubs.gitService.getSnapshot).toHaveBeenCalledWith({ id: 'ws-1', rootPath: '/repo' });
    expect(out).toEqual({ workspaceId: 'ws-1', branch: 'main' });
  });

  it('git.getSnapshot throws on unknown workspace id', async () => {
    const stubs = makeStubs();
    const handlers = createIpcHandlers(stubs);
    await expect(handlers['citybase:git.getSnapshot'](null, 'nope'))
      .rejects.toThrow(/unknown workspace id: nope/);
    expect(stubs.gitService.getSnapshot).not.toHaveBeenCalled();
  });

  it('git.refresh shares behavior with git.getSnapshot (same handler instance)', () => {
    const stubs = makeStubs();
    const handlers = createIpcHandlers(stubs);
    expect(handlers['citybase:git.refresh']).toBe(handlers['citybase:git.getSnapshot']);
  });
});
