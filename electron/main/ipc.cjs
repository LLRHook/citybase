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
const { runWorkspaceChecks } = require('./services/workspaceChecks.cjs');
const { createRunStore } = require('./services/runStore.cjs');

function buildAgentManager(emitEvent) {
  const codex = new CodexAdapter({ processService });
  const claude = new ClaudeAdapter({ processService });
  // Persist run history across restarts (FEAT-008): seed from disk, save on change.
  const runStore = createRunStore({ userDataDir: app.getPath('userData') });
  return createAgentManager({
    adapters: { codex, claude },
    detect: () => detectAgentBinaries(),
    emitEvent,
    initialRuns: runStore.loadSync(),
    persist: (runs) => { runStore.save(runs).catch(() => {}); },
  });
}

function registerIpc({ getMainWindow }) {
  const sendAgentEvent = (payload) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(AGENT_EVENT_CHANNEL, payload);
  };

  // The manager emits needsApproval events through the same channel so the
  // renderer's approval queue can surface a pending run before it spawns.
  const agentManager = buildAgentManager(sendAgentEvent);

  // Pre-bind processService so the IPC handler doesn't need to know
  // about it; tests inject their own runner instead.
  const boundChecksRunner = ({ workspace }) =>
    runWorkspaceChecks({ workspace, processService });

  const { handlers } = createIpcHandlers({
    app,
    workspaceService,
    gitService,
    agentManager,
    detectAgentBinaries,
    sendAgentEvent,
    getMainWindow,
    runWorkspaceChecks: boundChecksRunner,
  });
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
}

module.exports = { registerIpc };
