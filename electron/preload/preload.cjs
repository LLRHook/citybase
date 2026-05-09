// Preload runs in an isolated world with access to a small Node API surface.
// We expose ONLY a typed `window.citybase` object via contextBridge — never
// raw ipcRenderer, fs, or shell. The renderer treats this object as its API.
const { contextBridge, ipcRenderer } = require('electron');
const { AGENT_EVENT_CHANNEL } = require('../main/agents/constants.cjs');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

const menuListeners = new Set();
ipcRenderer.on('citybase:menu', (_evt, payload) => {
  for (const cb of menuListeners) {
    try { cb(payload); } catch (err) { console.error('citybase menu listener', err); }
  }
});

const agentEventListeners = new Set();
ipcRenderer.on(AGENT_EVENT_CHANNEL, (_evt, payload) => {
  for (const cb of agentEventListeners) {
    try { cb(payload); } catch (err) { console.error('citybase agent event listener', err); }
  }
});

const api = {
  app: {
    getVersion: () => invoke('citybase:app.getVersion'),
    getPlatform: () => invoke('citybase:app.getPlatform'),
  },
  workspace: {
    pick: () => invoke('citybase:workspace.pick'),
    getCurrent: () => invoke('citybase:workspace.getCurrent'),
    setCurrent: (id) => invoke('citybase:workspace.setCurrent', id),
    listRecent: () => invoke('citybase:workspace.listRecent'),
    forget: (id) => invoke('citybase:workspace.forget', id),
  },
  git: {
    getSnapshot: (workspaceId) => invoke('citybase:git.getSnapshot', workspaceId),
    refresh: (workspaceId) => invoke('citybase:git.refresh', workspaceId),
  },
  agents: {
    detect: () => invoke('citybase:agents.detect'),
    list: () => invoke('citybase:agents.list'),
    startRun: (params) => invoke('citybase:agent.startRun', params),
    cancel: (runId) => invoke('citybase:agent.cancel', runId),
    getRun: (runId) => invoke('citybase:agent.getRun', runId),
    reportUsage: (runId) => invoke('citybase:agent.reportUsage', runId),
    produceDiff: (runId) => invoke('citybase:agent.produceDiff', runId),
    runChecks: (runId) => invoke('citybase:agent.runChecks', runId),
    openPR: (runId, prParams) => invoke('citybase:agent.openPR', runId, prParams),
    approve: (runId) => invoke('citybase:agent.approve', runId),
    reject: (runId) => invoke('citybase:agent.reject', runId),
    listPendingApprovals: () => invoke('citybase:agent.listPendingApprovals'),
    onEvent: (cb) => {
      agentEventListeners.add(cb);
      return () => { agentEventListeners.delete(cb); };
    },
  },
  menu: {
    onCommand: (cb) => {
      menuListeners.add(cb);
      return () => { menuListeners.delete(cb); };
    },
  },
};

contextBridge.exposeInMainWorld('citybase', api);
