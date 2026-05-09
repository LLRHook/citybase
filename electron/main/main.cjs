// Electron main entry. Owns BrowserWindow, app lifecycle, and IPC registration.
// All native capabilities live in the main process. The renderer talks to us
// only through the typed `window.citybase` API exposed by preload.cjs.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { buildMenu } = require('./menu.cjs');
const { registerIpc } = require('./ipc.cjs');
const { resolveLaunchTarget, WINDOW_BOUNDS } = require('./windowConfig.cjs');
const { getCurrentWorkspace } = require('./services/workspaceService.cjs');
const { detectAgentBinaries } = require('./agents/detect.cjs');
const { buildBootPayload } = require('./bootPayload.cjs');
const { BOOT_PAYLOAD_CHANNEL } = require('./agents/constants.cjs');

let mainWindow = null;

function createWindow() {
  const target = resolveLaunchTarget({
    argv: process.argv,
    env: process.env,
    distIndexPath: path.join(__dirname, '..', '..', 'dist', 'index.html'),
  });

  mainWindow = new BrowserWindow({
    ...WINDOW_BOUNDS,
    backgroundColor: '#070914',
    title: 'Citybase',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (target.kind === 'dev') {
    mainWindow.loadURL(target.url);
    if (target.openDevTools) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadFile(target.file);
  }

  // Push the boot payload (detected agents + auto-restored workspace) to
  // the renderer the moment the window is ready. Without this, App.jsx
  // has to make at least two extra IPC roundtrips on mount before the
  // UI can settle — the v1 auto-boot gate explicitly forbids that.
  mainWindow.webContents.once('did-finish-load', async () => {
    try {
      const payload = await buildBootPayload({
        detect: () => detectAgentBinaries(),
        getCurrentWorkspace,
      });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(BOOT_PAYLOAD_CHANNEL, payload);
      }
    } catch (err) {
      // Swallow: the renderer can still call detect / getCurrent on
      // demand. We log so a real failure isn't completely silent.
      console.error('citybase: failed to build boot payload', err);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

app.setName('Citybase');

app.whenReady().then(async () => {
  registerIpc({ getMainWindow });
  buildMenu({ getMainWindow });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Auto-load most recent workspace on launch (best-effort; renderer drives UI).
  await getCurrentWorkspace().catch(() => null);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
