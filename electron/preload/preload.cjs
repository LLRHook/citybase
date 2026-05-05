// Preload runs in an isolated world with access to a small Node API surface.
// We expose ONLY a typed `window.citybase` object via contextBridge — never
// raw ipcRenderer, fs, or shell. The renderer treats this object as its API.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

const menuListeners = new Set();
ipcRenderer.on('citybase:menu', (_evt, payload) => {
  for (const cb of menuListeners) {
    try { cb(payload); } catch (err) { console.error('citybase menu listener', err); }
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
  menu: {
    onCommand: (cb) => {
      menuListeners.add(cb);
      return () => { menuListeners.delete(cb); };
    },
  },
};

contextBridge.exposeInMainWorld('citybase', api);
