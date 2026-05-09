// Registers all IPC handlers exposed to the renderer through preload.cjs.
// Every handler:
//   - has a typed/declared shape (the contract is the preload API),
//   - validates inputs (paths must resolve under workspace root, ids must be known),
//   - returns plain serializable objects,
//   - never accepts arbitrary command strings from the renderer.
const { app, ipcMain } = require('electron');
const workspaceService = require('./services/workspaceService.cjs');
const gitService = require('./services/gitService.cjs');

function registerIpc({ getMainWindow }) {
  ipcMain.handle('citybase:app.getVersion', () => app.getVersion());
  ipcMain.handle('citybase:app.getPlatform', () => process.platform);

  ipcMain.handle('citybase:workspace.pick', async () => {
    return workspaceService.pickWorkspace({ window: getMainWindow() });
  });
  ipcMain.handle('citybase:workspace.getCurrent', () => workspaceService.getCurrentWorkspace());
  ipcMain.handle('citybase:workspace.setCurrent', (_evt, id) => workspaceService.setCurrentWorkspace(id));
  ipcMain.handle('citybase:workspace.listRecent', () => workspaceService.listRecentWorkspaces());
  ipcMain.handle('citybase:workspace.forget', (_evt, id) => workspaceService.forgetWorkspace(id));

  const handleGitSnapshot = async (_evt, workspaceId) => {
    const ws = await workspaceService.getWorkspaceById(workspaceId);
    if (!ws) throw new Error(`unknown workspace id: ${workspaceId}`);
    return gitService.getSnapshot(ws);
  };
  ipcMain.handle('citybase:git.getSnapshot', handleGitSnapshot);
  ipcMain.handle('citybase:git.refresh', handleGitSnapshot);
}

module.exports = { registerIpc };
