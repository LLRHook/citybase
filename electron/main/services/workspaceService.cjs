// workspaceService.cjs — Electron glue over the pure workspace registry
// (workspaceServiceCore.cjs). Keeps the historical singleton API so every
// existing importer is unchanged: userData dir from the Electron app,
// folder picking via the native dialog.
const { app, dialog } = require('electron');
const { createWorkspaceService } = require('./workspaceServiceCore.cjs');

async function showOpenDialog(window) {
  const result = await dialog.showOpenDialog(window || undefined, {
    title: 'Open Workspace',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}

module.exports = createWorkspaceService({
  getUserDataDir: () => app.getPath('userData'),
  showOpenDialog,
});
