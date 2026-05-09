// Glues the pure handler factory in ipcHandlers.cjs to ipcMain.handle.
// Every handler:
//   - has a typed/declared shape (the contract is the preload API),
//   - validates inputs (paths must resolve under workspace root, ids must be known),
//   - returns plain serializable objects,
//   - never accepts arbitrary command strings from the renderer.
const { app, ipcMain } = require('electron');
const workspaceService = require('./services/workspaceService.cjs');
const gitService = require('./services/gitService.cjs');
const processService = require('./services/processService.cjs');
const { createIpcHandlers } = require('./ipcHandlers.cjs');
const { AGENT_EVENT_CHANNEL } = require('./agents/constants.cjs');
const { createAgentManager } = require('./agents/agentManager.cjs');
const { detectAgentBinaries } = require('./agents/detect.cjs');
const { CodexAdapter } = require('./agents/CodexAdapter.cjs');
const { ClaudeAdapter } = require('./agents/ClaudeAdapter.cjs');

function buildAgentManager() {
  const codex = new CodexAdapter({ processService });
  const claude = new ClaudeAdapter({ processService });
  return createAgentManager({
    adapters: { codex, claude },
    detect: () => detectAgentBinaries(),
  });
}

function registerIpc({ getMainWindow }) {
  const agentManager = buildAgentManager();

  const sendAgentEvent = (payload) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(AGENT_EVENT_CHANNEL, payload);
  };

  const { handlers } = createIpcHandlers({
    app,
    workspaceService,
    gitService,
    agentManager,
    detectAgentBinaries,
    sendAgentEvent,
    getMainWindow,
  });
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
}

module.exports = { registerIpc };
