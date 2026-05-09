// Pure factory that returns the channel→handler map for ipcMain.handle.
// Lives in its own file (no `require('electron')`) so unit tests can import
// it directly with stubbed workspaceService / gitService.
//
// ipc.cjs glues this to the real ipcMain by iterating over the result.

function createIpcHandlers({ app, workspaceService, gitService, getMainWindow }) {
  if (!app || typeof app.getVersion !== 'function') {
    throw new TypeError('createIpcHandlers: app is required');
  }
  if (!workspaceService) throw new TypeError('createIpcHandlers: workspaceService is required');
  if (!gitService) throw new TypeError('createIpcHandlers: gitService is required');
  if (typeof getMainWindow !== 'function') {
    throw new TypeError('createIpcHandlers: getMainWindow must be a function');
  }

  const handleGitSnapshot = async (_evt, workspaceId) => {
    const ws = await workspaceService.getWorkspaceById(workspaceId);
    if (!ws) throw new Error(`unknown workspace id: ${workspaceId}`);
    return gitService.getSnapshot(ws);
  };

  return {
    'citybase:app.getVersion': () => app.getVersion(),
    'citybase:app.getPlatform': () => process.platform,
    'citybase:workspace.pick': async () => workspaceService.pickWorkspace({ window: getMainWindow() }),
    'citybase:workspace.getCurrent': () => workspaceService.getCurrentWorkspace(),
    'citybase:workspace.setCurrent': (_evt, id) => workspaceService.setCurrentWorkspace(id),
    'citybase:workspace.listRecent': () => workspaceService.listRecentWorkspaces(),
    'citybase:workspace.forget': (_evt, id) => workspaceService.forgetWorkspace(id),
    'citybase:git.getSnapshot': handleGitSnapshot,
    'citybase:git.refresh': handleGitSnapshot,
  };
}

module.exports = { createIpcHandlers };
