// Glues the pure handler factory in ipcHandlers.cjs to ipcMain.handle.
// Every handler:
//   - has a typed/declared shape (the contract is the preload API),
//   - validates inputs (paths must resolve under workspace root, ids must be known),
//   - returns plain serializable objects,
//   - never accepts arbitrary command strings from the renderer.
const { app, ipcMain } = require('electron');
const workspaceService = require('./services/workspaceService.cjs');
const gitService = require('./services/gitService.cjs');
const { createIpcHandlers } = require('./ipcHandlers.cjs');

function registerIpc({ getMainWindow }) {
  const handlers = createIpcHandlers({
    app,
    workspaceService,
    gitService,
    getMainWindow,
  });
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
}

module.exports = { registerIpc };
