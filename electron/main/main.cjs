// Electron main entry. Owns BrowserWindow, app lifecycle, and IPC registration.
// All native capabilities live in the main process. The renderer talks to us
// only through the typed `window.citybase` API exposed by preload.cjs.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { buildMenu } = require('./menu.cjs');
const { registerIpc } = require('./ipc.cjs');
const { getCurrentWorkspace } = require('./services/workspaceService.cjs');

const isDev = process.env.CITYBASE_DEV === '1' || process.argv.includes('--dev');
const DEV_URL = process.env.CITYBASE_DEV_URL || 'http://localhost:5173';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#070914',
    title: 'Citybase',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

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
